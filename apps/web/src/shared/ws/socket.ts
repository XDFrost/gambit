import { ServerEnvelopeSchema, type ClientEnvelope, type Command } from '@gambit/protocol';
import { useGameStore } from '@/shared/store/gameStore';
import { wsUrl } from '@/shared/config';
import { loadSession, saveSession, type StoredSession } from './session';

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export interface ConnectOptions {
  roomCode: string;
  /** Present when joining as a new player; otherwise HELLO with the stored token. */
  nickname?: string;
  session?: StoredSession | null;
}

/**
 * One socket per room. Reconnects with backoff, replays HELLO on reopen, and asks for a
 * snapshot whenever a sequence gap is detected.
 */
class GameSocket {
  private ws: WebSocket | null = null;
  private opts: ConnectOptions | null = null;
  private session: StoredSession | null = null;
  private attempts = 0;
  private timer: number | null = null;
  private closedByUser = false;

  connect(opts: ConnectOptions): void {
    this.disconnect();
    this.closedByUser = false;
    this.opts = opts;
    this.session = opts.session ?? loadSession(opts.roomCode).active;
    useGameStore.getState().setRoom(opts.roomCode);
    this.open();
  }

  disconnect(): void {
    this.closedByUser = true;
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = null;
    this.ws?.close(1000, 'bye');
    this.ws = null;
  }

  get currentSession(): StoredSession | null {
    return this.session;
  }

  private url(code: string): string {
    return wsUrl(code);
  }

  private open(): void {
    if (!this.opts) return;
    const store = useGameStore.getState();
    store.setConnection(this.attempts === 0 ? 'connecting' : 'reconnecting');
    const ws = new WebSocket(this.url(this.opts.roomCode));
    this.ws = ws;
    ws.onopen = () => {
      this.attempts = 0;
      useGameStore.getState().setConnection('open');
      if (this.session) this.send({ type: 'HELLO', sessionToken: this.session.sessionToken });
      else if (this.opts?.nickname) this.send({ type: 'JOIN_GAME', nickname: this.opts.nickname });
    };
    ws.onmessage = (msg) => this.onMessage(String(msg.data));
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.closedByUser || ev.code === 1008) {
        useGameStore.getState().setConnection('closed');
        return;
      }
      this.attempts += 1;
      const delay = Math.min(8000, 400 * 2 ** Math.min(this.attempts, 5));
      useGameStore.getState().setConnection('reconnecting');
      this.timer = window.setTimeout(() => this.open(), delay);
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  private onMessage(raw: string): void {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return;
    }
    const parsed = ServerEnvelopeSchema.safeParse(json);
    if (!parsed.success) return;
    const env = parsed.data;
    const store = useGameStore.getState();

    if (env.event.type === 'SESSION' && this.opts) {
      const s: StoredSession = {
        roomCode: this.opts.roomCode,
        playerId: env.event.playerId,
        sessionToken: env.event.sessionToken,
        nickname: this.opts.nickname ?? '',
      };
      this.session = s;
      saveSession(s);
    }
    if (env.event.type === 'ERROR' && env.event.code === 'NOT_AUTHED' && this.session && !this.opts?.nickname) {
      // Stored token no longer valid: forget it so the UI offers a fresh join.
      this.session = null;
    }
    // Gap detection on room-sequenced events: ask for a snapshot.
    const sequenced = env.event.type !== 'ERROR' && env.event.type !== 'ACK' && env.event.type !== 'SESSION' && env.event.type !== 'STATE_SNAPSHOT';
    if (sequenced && store.lastSeq > 0 && env.seq > store.lastSeq + 1) this.send({ type: 'RESYNC' });
    store.applyEnvelope(env);
  }

  /** Send a command. Returns the commandId so callers can correlate ACK/ERROR. */
  send(command: Command, extra?: { cardId?: string; tileId?: number }): string {
    const commandId = newId();
    const env: ClientEnvelope = { v: 1, commandId, command };
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(env));
      if (command.type !== 'HELLO' && command.type !== 'RESYNC') useGameStore.getState().markPending(commandId, command.type, extra);
    }
    return commandId;
  }
}

export const socket = new GameSocket();
