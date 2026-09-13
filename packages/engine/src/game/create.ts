import type { GameSettings, TeamId } from '@gambit/protocol';
import { DEFAULT_SETTINGS } from '@gambit/protocol';
import { seedToState } from '../rng';
import type { GameState, Team } from '../state';

export const emptyTeam = (id: TeamId): Team => ({
  id,
  wordsTotal: 0,
  wordsRemaining: 0,
  deck: [],
  hand: [],
  discard: [],
  playedThisTurn: false,
  oncePerGameUsed: [],
  knownOwners: {},
  infoResults: [],
});

/** A fresh lobby. The server supplies the seed (random) and the room code. */
export const createLobby = (roomCode: string, seed: string, now: number, settings: GameSettings = DEFAULT_SETTINGS): GameState => ({
  roomCode,
  status: 'lobby',
  settings,
  seed,
  rngState: seedToState(seed),
  hostId: null,
  players: {},
  teams: { ember: emptyTeam('ember'), tide: emptyTeam('tide') },
  tiles: [],
  key: null,
  turn: null,
  activeEffects: [],
  result: null,
  eventSeq: 0,
  nextId: 1,
  createdAt: now,
  updatedAt: now,
});

export const nextId = (state: GameState, prefix: string): string => {
  const id = `${prefix}${state.nextId}`;
  state.nextId += 1;
  return id;
};
