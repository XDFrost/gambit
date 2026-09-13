import type { Command, ErrorCode, PlayerId, SeatStatus, TeamId } from '@gambit/protocol';
import { nextId } from './create';
import { hasCard } from '../cards/registry';
import { EngineError } from '../errors';
import { EventSink, type GameEvent } from '../events';
import { Rng } from '../rng';
import type { GameState } from '../state';
import { applyLobbyCommand } from '../lobby/reducer';
import { applyTurnCommand, endTurn } from '../turn/reducer';
import { applyPlayCard } from '../cards/reducer';

/** Server-originated commands (never accepted from a socket; the protocol schema rejects them). */
export type InternalCommand =
  | { type: 'INTERNAL_SEAT'; playerId: PlayerId; status: SeatStatus }
  | { type: 'INTERNAL_TIMEOUT_END_TURN' }
  /** Test and simulation aid: put a specific card into a team's hand. */
  | { type: 'INTERNAL_GIVE_CARD'; team: TeamId; defId: string };

export type EngineCommand = Command | InternalCommand;

export interface ApplyContext {
  /** Player issuing the command; null for internal commands. */
  actorId: PlayerId | null;
  now: number;
}

export interface ApplyOk {
  ok: true;
  state: GameState;
  events: GameEvent[];
}
export interface ApplyErr {
  ok: false;
  code: ErrorCode;
  message: string;
}
export type ApplyResult = ApplyOk | ApplyErr;

/** Everything a reducer needs. Reducers mutate `state` (a fresh deep copy) in place. */
export interface Ctx {
  state: GameState;
  rng: Rng;
  sink: EventSink;
  now: number;
  actorId: PlayerId | null;
}

const clone = <T>(v: T): T => structuredClone(v);

/**
 * The single entry point of the engine. Pure: same (state, command, ctx) -> same result.
 * On error the input state is untouched and no events are produced.
 */
export const apply = (input: GameState, command: EngineCommand, ctx: ApplyContext): ApplyResult => {
  const state = clone(input);
  const rng = new Rng(state.rngState);
  const sink = new EventSink(state);
  const c: Ctx = { state, rng, sink, now: ctx.now, actorId: ctx.actorId };
  try {
    switch (command.type) {
      case 'HELLO':
      case 'RESYNC':
        // Connection-level; handled by the server. No state change.
        break;
      case 'JOIN_GAME':
      case 'LEAVE':
      case 'SET_TEAM':
      case 'SET_ROLE':
      case 'TOGGLE_READY':
      case 'START_GAME':
      case 'PROMOTE_SPYMASTER':
      case 'REQUEST_REMATCH':
      case 'INTERNAL_SEAT':
        applyLobbyCommand(c, command);
        break;
      case 'GIVE_CLUE':
      case 'MARK_WORD':
      case 'SELECT_WORD':
      case 'END_TURN':
        applyTurnCommand(c, command);
        break;
      case 'INTERNAL_TIMEOUT_END_TURN':
        if (state.status === 'in_game' && state.turn) endTurn(c, 'timeout');
        break;
      case 'INTERNAL_GIVE_CARD': {
        if (state.status !== 'in_game') return { ok: false, code: 'WRONG_STATUS', message: 'Game not running.' };
        if (!hasCard(command.defId)) return { ok: false, code: 'BAD_PAYLOAD', message: `Unknown card ${command.defId}` };
        const card = { id: nextId(state, 'gc'), defId: command.defId, drawnAtTurn: state.turn?.index ?? 0 };
        state.teams[command.team].hand.push(card);
        const t = state.teams[command.team];
        sink.team(
          command.team,
          { type: 'CARD_DRAWN', team: command.team, reason: 'effect', card: { id: card.id, defId: card.defId }, deckCount: t.deck.length, handCount: t.hand.length },
          { type: 'CARD_DRAWN', team: command.team, reason: 'effect', deckCount: t.deck.length, handCount: t.hand.length },
        );
        break;
      }
      case 'PLAY_CARD':
        applyPlayCard(c, command);
        break;
    }
    state.rngState = rng.state;
    state.updatedAt = ctx.now;
    return { ok: true, state, events: sink.events };
  } catch (err) {
    if (err instanceof EngineError) return { ok: false, code: err.code, message: err.message };
    return { ok: false, code: 'INTERNAL', message: err instanceof Error ? err.message : String(err) };
  }
};
