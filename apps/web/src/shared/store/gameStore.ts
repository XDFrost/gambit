import { create } from 'zustand';
import type { ClientView, Command, ErrorCode, Event, ServerEnvelope, TileId } from '@gambit/protocol';
import { formatFeedItem, type FeedItem } from '@/shared/store/feed';

export type ConnectionState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface Targeting {
  cardId: string;
  needed: 1 | 2;
  picked: TileId[];
  validTiles: TileId[];
}

export interface Flash {
  id: number;
  event: Event;
  at: number;
}

export interface GameStoreState {
  view: ClientView | null;
  connection: ConnectionState;
  roomCode: string | null;
  lastSeq: number;
  feed: FeedItem[];
  /** Recent events for animations; consumers read and ignore stale ones. */
  flashes: Flash[];
  pending: Record<string, { type: Command['type']; at: number; cardId?: string; tileId?: TileId }>;
  lastError: { code: ErrorCode; message: string; at: number; replyTo?: string } | null;
  inspectingCardId: string | null;
  targeting: Targeting | null;
  confirmCardId: string | null;
  muted: boolean;
  /** Until this time the board keeps showing so a staged reveal can finish before the results screen. */
  revealHoldUntil: number;

  setConnection: (c: ConnectionState) => void;
  setRoom: (code: string | null) => void;
  applyEnvelope: (env: ServerEnvelope) => void;
  markPending: (commandId: string, type: Command['type'], extra?: { cardId?: string; tileId?: TileId }) => void;
  clearPending: (commandId: string) => void;
  inspect: (cardId: string | null) => void;
  startTargeting: (t: Targeting | null) => void;
  pickTile: (tile: TileId) => void;
  setConfirm: (cardId: string | null) => void;
  setMuted: (m: boolean) => void;
  dismissError: () => void;
  reset: () => void;
}

let flashId = 0;
const MAX_FEED = 40;
/** Total length of the staged reveal (lift, hold, flip, settle). Keep in sync with RevealStage. */
export const REVEAL_STAGE_MS = 3000;
/** Snapshots apply this long before the stage ends, so the settled tile is already correct underneath. */
const SNAPSHOT_LEAD_MS = 150;
let pendingSnapshot: ServerEnvelope | null = null;
let pendingTimer: number | null = null;

export const useGameStore = create<GameStoreState>((set, get) => ({
  view: null,
  connection: 'idle',
  roomCode: null,
  lastSeq: 0,
  feed: [],
  flashes: [],
  pending: {},
  lastError: null,
  inspectingCardId: null,
  targeting: null,
  confirmCardId: null,
  revealHoldUntil: 0,
  muted: (() => {
    try {
      return localStorage.getItem('gambit.muted') === '1';
    } catch {
      return false;
    }
  })(),

  setConnection: (connection) => set({ connection }),
  setRoom: (roomCode) => set({ roomCode }),

  applyEnvelope: (env) => {
    const { event } = env;
    const s = get();
    switch (event.type) {
      case 'STATE_SNAPSHOT': {
        // While a reveal is being staged, hold the new state so the table changes with the flip.
        const holdFor = s.revealHoldUntil - SNAPSHOT_LEAD_MS - Date.now();
        if (holdFor > 0) {
          pendingSnapshot = env;
          if (pendingTimer) window.clearTimeout(pendingTimer);
          pendingTimer = window.setTimeout(() => {
            const next = pendingSnapshot;
            pendingSnapshot = null;
            pendingTimer = null;
            if (next) useGameStore.getState().applyEnvelope(next);
          }, holdFor);
          return;
        }
        const patch: Partial<GameStoreState> = { view: event.view, lastSeq: Math.max(s.lastSeq, env.seq) };
        // Drop UI state that no longer applies (card left the hand, turn moved on).
        const hand = event.view.team?.hand ?? [];
        if (s.inspectingCardId && !hand.some((c) => c.id === s.inspectingCardId)) patch.inspectingCardId = null;
        if (s.targeting && !hand.some((c) => c.id === s.targeting!.cardId)) patch.targeting = null;
        if (s.confirmCardId && !hand.some((c) => c.id === s.confirmCardId)) patch.confirmCardId = null;
        set(patch);
        return;
      }
      case 'ERROR': {
        const pending = { ...s.pending };
        if (event.replyTo) delete pending[event.replyTo];
        set({
          pending,
          lastError: { code: event.code, message: event.message, at: Date.now(), ...(event.replyTo ? { replyTo: event.replyTo } : {}) },
          targeting: null,
          confirmCardId: null,
        });
        return;
      }
      case 'ACK': {
        const pending = { ...s.pending };
        delete pending[event.replyTo];
        set({ pending });
        return;
      }
      case 'SESSION':
        return;
      default: {
        const item = formatFeedItem(event, s.view);
        const feed = item ? [...s.feed, { ...item, seq: env.seq }].slice(-MAX_FEED) : s.feed;
        const flashes = [...s.flashes, { id: ++flashId, event, at: Date.now() }].slice(-12);
        const patch: Partial<GameStoreState> = { feed, flashes, lastSeq: Math.max(s.lastSeq, env.seq) };
        if (event.type === 'WORD_REVEALED') patch.revealHoldUntil = Math.max(s.revealHoldUntil, Date.now() + REVEAL_STAGE_MS);
        set(patch);
      }
    }
  },

  markPending: (commandId, type, extra) =>
    set((s) => ({ pending: { ...s.pending, [commandId]: { type, at: Date.now(), ...extra } } })),
  clearPending: (commandId) =>
    set((s) => {
      const pending = { ...s.pending };
      delete pending[commandId];
      return { pending };
    }),
  inspect: (inspectingCardId) => set({ inspectingCardId }),
  startTargeting: (targeting) => set({ targeting, inspectingCardId: null }),
  pickTile: (tile) =>
    set((s) => {
      if (!s.targeting) return {};
      if (!s.targeting.validTiles.includes(tile)) return {};
      const picked = s.targeting.picked.includes(tile)
        ? s.targeting.picked.filter((t) => t !== tile)
        : [...s.targeting.picked, tile].slice(-s.targeting.needed);
      return { targeting: { ...s.targeting, picked } };
    }),
  setConfirm: (confirmCardId) => set({ confirmCardId }),
  setMuted: (muted) => {
    try {
      localStorage.setItem('gambit.muted', muted ? '1' : '0');
    } catch {
      /* ignore */
    }
    set({ muted });
  },
  dismissError: () => set({ lastError: null }),
  reset: () => {
    pendingSnapshot = null;
    if (pendingTimer) window.clearTimeout(pendingTimer);
    pendingTimer = null;
    set({
      view: null,
      connection: 'idle',
      roomCode: null,
      lastSeq: 0,
      feed: [],
      flashes: [],
      pending: {},
      lastError: null,
      inspectingCardId: null,
      targeting: null,
      confirmCardId: null,
      revealHoldUntil: 0,
    });
  },
}));

/** Convenience selectors. */
export const selectView = (s: GameStoreState) => s.view;
export const selectMe = (s: GameStoreState) => s.view?.me ?? null;
export const selectTurn = (s: GameStoreState) => s.view?.public.turn ?? null;
