import { expect } from 'vitest';
import type { ErrorCode, GameSettings, Owner, PlayerId, TeamId, TileId } from '@gambit/protocol';
import { DEFAULT_SETTINGS } from '@gambit/protocol';
import { apply, createLobby, type EngineCommand, type GameEvent, type GameState } from '../src';

export const IDS = {
  emberSpy: 'p1',
  emberOp: 'p2',
  tideSpy: 'p3',
  tideOp: 'p4',
} as const;

export const run = (state: GameState, cmd: EngineCommand, actorId: PlayerId | null, now = 1000) => {
  const r = apply(state, cmd, { actorId, now });
  if (!r.ok) throw new Error(`${cmd.type} failed: ${r.code} ${r.message}`);
  return r;
};

export const expectErr = (state: GameState, cmd: EngineCommand, actorId: PlayerId | null, code: ErrorCode) => {
  const r = apply(state, cmd, { actorId, now: 1000 });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.code).toBe(code);
};

/** A ready-to-start lobby: Ann/Bo on Ember, Cy/Di on Tide. */
export const setupLobby = (seed = 'seed-1'): GameState => {
  let s = createLobby('ABCDEF', seed, 0);
  s = run(s, { type: 'JOIN_GAME', nickname: 'Ann' }, null).state;
  s = run(s, { type: 'JOIN_GAME', nickname: 'Bo' }, null).state;
  s = run(s, { type: 'JOIN_GAME', nickname: 'Cy' }, null).state;
  s = run(s, { type: 'JOIN_GAME', nickname: 'Di' }, null).state;
  s = run(s, { type: 'SET_TEAM', team: 'ember' }, IDS.emberSpy).state;
  s = run(s, { type: 'SET_ROLE', role: 'spymaster' }, IDS.emberSpy).state;
  s = run(s, { type: 'SET_TEAM', team: 'ember' }, IDS.emberOp).state;
  s = run(s, { type: 'SET_TEAM', team: 'tide' }, IDS.tideSpy).state;
  s = run(s, { type: 'SET_ROLE', role: 'spymaster' }, IDS.tideSpy).state;
  s = run(s, { type: 'SET_TEAM', team: 'tide' }, IDS.tideOp).state;
  return s;
};

export const setupGame = (seed = 'seed-1', settings: Partial<GameSettings> = {}): GameState => {
  const lobby = setupLobby(seed);
  return run(lobby, { type: 'START_GAME', settings: { ...DEFAULT_SETTINGS, ...settings } }, IDS.emberSpy).state;
};

export const spyOf = (team: TeamId): PlayerId => (team === 'ember' ? IDS.emberSpy : IDS.tideSpy);
export const opOf = (team: TeamId): PlayerId => (team === 'ember' ? IDS.emberOp : IDS.tideOp);

export const tilesOwned = (state: GameState, owner: Owner): TileId[] =>
  state.tiles.filter((t) => !t.revealed && state.key!.owners[t.id] === owner).map((t) => t.id);

export const firstOwned = (state: GameState, owner: Owner): TileId => {
  const id = tilesOwned(state, owner)[0];
  if (id === undefined) throw new Error(`no unrevealed ${owner} tile`);
  return id;
};

/** Give the active team a clue so the guess phase opens. */
export const giveClue = (state: GameState, count = 2, word = 'ZZYZX'): GameState => {
  const team = state.turn!.team;
  return run(state, { type: 'GIVE_CLUE', word, count, expectedTurnIndex: state.turn!.index }, spyOf(team)).state;
};

/** Put a specific card into the active team's hand (test-only shortcut). */
export const giveCard = (state: GameState, defId: string, team: TeamId = state.turn!.team): { state: GameState; cardId: string } => {
  const s = structuredClone(state);
  const cardId = `test-${defId}-${s.nextId++}`;
  s.teams[team].hand.push({ id: cardId, defId, drawnAtTurn: s.turn?.index ?? 0 });
  return { state: s, cardId };
};

export const play = (state: GameState, cardId: string, target?: { tiles?: TileId[]; row?: number; block?: TileId; handCardId?: string }) => {
  const team = state.turn!.team;
  return run(
    state,
    { type: 'PLAY_CARD', cardInstanceId: cardId, ...(target ? { target } : {}), expectedTurnIndex: state.turn!.index },
    opOf(team),
  );
};

export const guess = (state: GameState, tileId: TileId) => {
  const team = state.turn!.team;
  return run(state, { type: 'SELECT_WORD', tileId, expectedTurnIndex: state.turn!.index }, opOf(team));
};

export const eventsOfType = <T extends GameEvent['event']['type']>(events: GameEvent[], type: T) =>
  events.filter((e) => e.event.type === type) as Array<GameEvent & { event: Extract<GameEvent['event'], { type: T }> }>;
