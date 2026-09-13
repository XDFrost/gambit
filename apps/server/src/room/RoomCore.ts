import {
  ClientEnvelopeSchema,
  ERROR_MESSAGES,
  MAX_FRAME_BYTES,
  type Command,
  type ErrorCode,
  type Event,
  type PlayerId,
  type ServerEnvelope,
} from '@gambit/protocol';
import { apply, createLobby, projectFor, type EngineCommand, type GameEvent, type GameState } from '@gambit/engine';
import { KEYS, type RoomStorage } from './storage';
import { RateLimiter } from './rateLimit';
import { randomHex } from './roomCode';

export interface Transport {
  send(connId: string, data: string): void;
  close(connId: string, code: number, reason: string): void;
  /** Persist per-connection data that must survive Durable Object hibernation. */
  attach?(connId: string, data: ConnAttachment): void;
}

export interface ConnAttachment {
  playerId: PlayerId | null;
}

export interface RoomCoreOptions {
  roomCode: string;
  storage: RoomStorage;
  transport: Transport;
  now?: () => number;
  /** Ask the host to wake us at `at` (ms epoch), or cancel with null. */
  scheduleAlarm?: (at: number | null) => void;
  seed?: () => string;
}

interface Conn {
  playerId: PlayerId | null;
  limiter: RateLimiter;
  dedupe: Map<string, { at: number; frames: string[] }>;
}

export const GRACE_MS = 60_000;
export const TEAM_AWAY_MS = 90_000;
export const IDLE_MS = 24 * 60 * 60 * 1000;
export const STALE_LOBBY_MS = 60 * 60 * 1000;
const DEDUPE_MS = 30_000;
const EVENT_LOG_KEEP = 500;

/**
 * Everything a room does, independent of transport and runtime. The Durable Object, the local
 * Node dev server, and the unit tests all drive this class the same way.
 */
export class RoomCore {
  private state: GameState | null = null;
  private loaded = false;
  private readonly conns = new Map<string, Conn>();
  private readonly pendingAway = new Map<PlayerId, number>();
  private readonly now: () => number;
  private readonly seed: () => string;

  constructor(private readonly opts: RoomCoreOptions) {
    this.now = opts.now ?? (() => Date.now());
    this.seed = opts.seed ?? (() => randomHex(16));
  }

  // ---------------------------------------------------------------- lifecycle

  private async load(): Promise<GameState | null> {
    if (!this.loaded) {
      this.state = (await this.opts.storage.get<GameState>(KEYS.state)) ?? null;
      this.loaded = true;
    }
    return this.state;
  }

  /** Is this room code available for a new game? */
  async isFree(): Promise<boolean> {
    const s = await this.load();
    if (!s) return true;
    const now = this.now();
    const live = [...this.conns.values()].some((c) => c.playerId !== null);
    if (live) return false;
    if (now - s.updatedAt >= IDLE_MS) return true;
    if (s.status === 'lobby' && now - s.updatedAt >= STALE_LOBBY_MS) return true;
    if (s.status === 'game_over' && now - s.updatedAt >= STALE_LOBBY_MS) return true;
    return false;
  }

  /**
   * Reset the room and create a fresh lobby. Returns false if the code is taken.
   * The Durable Object does not know its own name, so the Worker passes the code in.
   */
  async claim(roomCode: string = this.opts.roomCode): Promise<boolean> {
    if (!(await this.isFree())) return false;
    await this.opts.storage.deleteAll();
    const now = this.now();
    this.state = createLobby(roomCode, this.seed(), now);
    this.loaded = true;
    await this.persist(this.state, []);
    this.rescheduleAlarm();
    return true;
  }

  /** Re-attach a connection after hibernation. */
  restoreConnection(connId: string, attachment: ConnAttachment | null): void {
    this.conns.set(connId, { playerId: attachment?.playerId ?? null, limiter: new RateLimiter(), dedupe: new Map() });
  }

  handleOpen(connId: string): void {
    if (!this.conns.has(connId)) this.restoreConnection(connId, null);
  }

  async handleClose(connId: string): Promise<void> {
    const conn = this.conns.get(connId);
    this.conns.delete(connId);
    if (!conn?.playerId) return;
    if (this.hasLiveConnection(conn.playerId)) return;
    this.pendingAway.set(conn.playerId, this.now() + GRACE_MS);
    this.rescheduleAlarm();
  }

  // ---------------------------------------------------------------- messages

  async handleMessage(connId: string, raw: unknown): Promise<void> {
    this.handleOpen(connId);
    const conn = this.conns.get(connId)!;
    const now = this.now();

    if (typeof raw !== 'string') return this.sendError(connId, 'BAD_PAYLOAD', undefined, 'Text frames only.');
    if (raw.length > MAX_FRAME_BYTES) return this.sendError(connId, 'BAD_PAYLOAD', undefined, 'Frame too large.');
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return this.sendError(connId, 'BAD_PAYLOAD', undefined, 'Invalid JSON.');
    }
    const parsed = ClientEnvelopeSchema.safeParse(json);
    if (!parsed.success) {
      const replyTo = typeof (json as { commandId?: unknown })?.commandId === 'string' ? (json as { commandId: string }).commandId : undefined;
      return this.sendError(connId, 'BAD_PAYLOAD', replyTo, parsed.error.issues[0]?.message);
    }
    const { commandId, command } = parsed.data;

    const cached = conn.dedupe.get(commandId);
    if (cached) {
      for (const f of cached.frames) this.opts.transport.send(connId, f);
      return;
    }
    for (const [k, v] of conn.dedupe) if (now - v.at > DEDUPE_MS) conn.dedupe.delete(k);

    const verdict = conn.limiter.check(command.type, now);
    if (verdict === 'abusive') {
      this.sendError(connId, 'RATE_LIMITED', commandId);
      this.opts.transport.close(connId, 1008, 'rate limited');
      this.conns.delete(connId);
      return;
    }
    if (verdict === 'limited') return this.sendError(connId, 'RATE_LIMITED', commandId);

    const frames: string[] = [];
    const record = (connIdOut: string, frame: string) => {
      if (connIdOut === connId) frames.push(frame);
    };
    await this.dispatch(connId, conn, commandId, command, record);
    conn.dedupe.set(commandId, { at: now, frames });
  }

  private async dispatch(connId: string, conn: Conn, commandId: string, command: Command, record: (connId: string, frame: string) => void): Promise<void> {
    const state = await this.load();
    const now = this.now();

    switch (command.type) {
      case 'HELLO': {
        if (!state) return this.sendError(connId, 'ROOM_NOT_FOUND', commandId, undefined, record);
        const sess = await this.opts.storage.get<{ playerId: PlayerId }>(KEYS.session(command.sessionToken));
        const player = sess ? state.players[sess.playerId] : undefined;
        if (!player || player.seat.status === 'left') return this.sendError(connId, 'NOT_AUTHED', commandId, undefined, record);
        this.bind(connId, conn, player.id);
        this.pendingAway.delete(player.id);
        if (player.seat.status !== 'connected') {
          await this.applyAndBroadcast({ type: 'INTERNAL_SEAT', playerId: player.id, status: 'connected' }, null, connId, commandId, record);
        } else {
          this.sendTo(connId, { type: 'ACK', replyTo: commandId }, record);
          this.sendSnapshot(connId, player.id, record);
        }
        this.rescheduleAlarm();
        return;
      }
      case 'JOIN_GAME': {
        if (!state) return this.sendError(connId, 'ROOM_NOT_FOUND', commandId, undefined, record);
        if (conn.playerId) return this.sendError(connId, 'WRONG_STATUS', commandId, 'You already joined.', record);
        const result = apply(state, command, { actorId: null, now });
        if (!result.ok) return this.sendError(connId, result.code, commandId, result.message, record);
        const joined = result.events.find((e) => e.event.type === 'PLAYER_JOINED');
        const playerId = joined && joined.event.type === 'PLAYER_JOINED' ? joined.event.player.id : null;
        if (!playerId) return this.sendError(connId, 'INTERNAL', commandId, undefined, record);
        const token = randomHex(16);
        this.state = result.state;
        await this.persist(result.state, result.events, { [KEYS.session(token)]: { playerId } });
        this.bind(connId, conn, playerId);
        this.sendTo(connId, { type: 'SESSION', playerId, sessionToken: token }, record);
        this.fanout(result.events, record);
        this.broadcastSnapshots(record);
        this.sendTo(connId, { type: 'ACK', replyTo: commandId }, record);
        this.rescheduleAlarm();
        return;
      }
      case 'RESYNC': {
        if (!state || !conn.playerId || !state.players[conn.playerId]) return this.sendError(connId, 'NOT_AUTHED', commandId, undefined, record);
        this.sendTo(connId, { type: 'ACK', replyTo: commandId }, record);
        this.sendSnapshot(connId, conn.playerId, record);
        return;
      }
      default: {
        if (!state || !conn.playerId || !state.players[conn.playerId]) return this.sendError(connId, 'NOT_AUTHED', commandId, undefined, record);
        await this.applyAndBroadcast(command, conn.playerId, connId, commandId, record);
        if (command.type === 'LEAVE') {
          conn.playerId = null;
          this.opts.transport.attach?.(connId, { playerId: null });
        }
        this.rescheduleAlarm();
      }
    }
  }

  private async applyAndBroadcast(command: EngineCommand, actorId: PlayerId | null, connId: string | null, commandId: string | null, record?: (connId: string, frame: string) => void): Promise<boolean> {
    const state = await this.load();
    if (!state) return false;
    const result = apply(state, command, { actorId, now: this.now() });
    if (!result.ok) {
      if (connId) this.sendError(connId, result.code, commandId ?? undefined, result.message, record);
      return false;
    }
    this.state = result.state;
    await this.persist(result.state, result.events);
    this.fanout(result.events, record);
    this.broadcastSnapshots(record);
    if (connId && commandId) this.sendTo(connId, { type: 'ACK', replyTo: commandId }, record);
    return true;
  }

  // ---------------------------------------------------------------- timers

  /** Run due timers. Called by the host's alarm. */
  async tick(): Promise<void> {
    const state = await this.load();
    if (!state) return;
    const now = this.now();

    // Players whose grace period elapsed become away.
    for (const [playerId, at] of [...this.pendingAway]) {
      if (at > now) continue;
      this.pendingAway.delete(playerId);
      if (this.hasLiveConnection(playerId)) continue;
      const p = state.players[playerId];
      if (p && p.seat.status === 'connected') await this.applyAndBroadcast({ type: 'INTERNAL_SEAT', playerId, status: 'away' }, null, null, null);
    }
    // Players with no connection and no pending grace (e.g. after hibernation) are away now.
    const s2 = this.state!;
    for (const p of Object.values(s2.players)) {
      if (p.seat.status === 'connected' && !this.hasLiveConnection(p.id) && !this.pendingAway.has(p.id)) {
        await this.applyAndBroadcast({ type: 'INTERNAL_SEAT', playerId: p.id, status: 'away' }, null, null, null);
      }
    }
    // Whole active team away for long enough: end their turn.
    const s3 = this.state!;
    const deadline = this.teamAwayDeadline(s3);
    if (deadline !== null && deadline <= now) await this.applyAndBroadcast({ type: 'INTERNAL_TIMEOUT_END_TURN' }, null, null, null);
    // Idle room: wipe it.
    const s4 = this.state!;
    if (this.conns.size === 0 && now - s4.updatedAt >= IDLE_MS) {
      await this.opts.storage.deleteAll();
      this.state = null;
      this.opts.scheduleAlarm?.(null);
      return;
    }
    this.rescheduleAlarm();
  }

  private teamAwayDeadline(state: GameState): number | null {
    if (state.status !== 'in_game' || !state.turn) return null;
    const members = Object.values(state.players).filter((p) => p.team === state.turn!.team && p.seat.status !== 'left');
    if (members.length === 0) return null;
    if (members.some((p) => p.seat.status === 'connected')) return null;
    const lastSeen = Math.max(...members.map((p) => p.seat.lastSeenAt));
    return lastSeen + TEAM_AWAY_MS;
  }

  private rescheduleAlarm(): void {
    if (!this.opts.scheduleAlarm || !this.state) return;
    const candidates: number[] = [...this.pendingAway.values()];
    const team = this.teamAwayDeadline(this.state);
    if (team !== null) candidates.push(team);
    if (this.conns.size === 0) candidates.push(this.state.updatedAt + IDLE_MS);
    this.opts.scheduleAlarm(candidates.length ? Math.min(...candidates) : null);
  }

  // ---------------------------------------------------------------- helpers

  private hasLiveConnection(playerId: PlayerId): boolean {
    for (const c of this.conns.values()) if (c.playerId === playerId) return true;
    return false;
  }

  private bind(connId: string, conn: Conn, playerId: PlayerId): void {
    conn.playerId = playerId;
    this.opts.transport.attach?.(connId, { playerId });
  }

  private async persist(state: GameState, events: GameEvent[], extra: Record<string, unknown> = {}): Promise<void> {
    const entries: Record<string, unknown> = { ...extra, [KEYS.state]: state, [KEYS.meta]: { roomCode: state.roomCode, status: state.status, createdAt: state.createdAt, updatedAt: state.updatedAt } };
    for (const e of events) entries[KEYS.event(e.seq)] = e;
    await this.opts.storage.put(entries);
    if (state.status === 'game_over' && state.eventSeq > EVENT_LOG_KEEP) {
      const old = await this.opts.storage.list<GameEvent>('ev:', { limit: state.eventSeq - EVENT_LOG_KEEP });
      await this.opts.storage.delete([...old.keys()]);
    }
  }

  private envelope(event: Event): string {
    const env: ServerEnvelope = { v: 1, seq: this.state?.eventSeq ?? 0, ts: this.now(), event };
    return JSON.stringify(env);
  }

  private sendTo(connId: string, event: Event, record?: (connId: string, frame: string) => void): void {
    const frame = this.envelope(event);
    this.opts.transport.send(connId, frame);
    record?.(connId, frame);
  }

  private sendError(connId: string, code: ErrorCode, replyTo?: string, message?: string, record?: (connId: string, frame: string) => void): void {
    this.sendTo(connId, { type: 'ERROR', code, message: message ?? ERROR_MESSAGES[code], ...(replyTo ? { replyTo } : {}) }, record);
  }

  private sendSnapshot(connId: string, playerId: PlayerId, record?: (connId: string, frame: string) => void): void {
    if (!this.state || !this.state.players[playerId]) return;
    this.sendTo(connId, { type: 'STATE_SNAPSHOT', view: projectFor(this.state, playerId) }, record);
  }

  private broadcastSnapshots(record?: (connId: string, frame: string) => void): void {
    for (const [connId, conn] of this.conns) if (conn.playerId) this.sendSnapshot(connId, conn.playerId, record);
  }

  /** Deliver each event to every connection allowed to see it, using the redacted variant otherwise. */
  private fanout(events: GameEvent[], record?: (connId: string, frame: string) => void): void {
    if (!this.state) return;
    for (const e of events) {
      const full: ServerEnvelope = { v: 1, seq: e.seq, ts: this.now(), event: e.event };
      const fullFrame = JSON.stringify(full);
      const variantFrame = e.publicVariant ? JSON.stringify({ ...full, event: e.publicVariant } satisfies ServerEnvelope) : null;
      for (const [connId, conn] of this.conns) {
        if (!conn.playerId) continue;
        const player = this.state.players[conn.playerId];
        if (!player) continue;
        const scope = e.scope;
        const allowed =
          scope.kind === 'public' ? true : scope.kind === 'team' ? player.team === scope.team && player.role !== 'spymaster' : player.id === scope.playerId;
        const frame = allowed ? fullFrame : variantFrame;
        if (!frame) continue;
        this.opts.transport.send(connId, frame);
        record?.(connId, frame);
      }
    }
  }

  /** Test/diagnostic access. Never expose over the network. */
  get connectionCount(): number {
    return this.conns.size;
  }
}
