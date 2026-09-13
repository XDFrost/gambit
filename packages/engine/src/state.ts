import type {
  GameSettings,
  GameStatus,
  Owner,
  Phase,
  PlayerId,
  Role,
  SeatStatus,
  TeamId,
  TileId,
} from '@gambit/protocol';

/**
 * Authoritative game state. This type never leaves the engine/server boundary.
 * Clients only ever receive the output of `projectFor` (see views/project.ts).
 */

export interface Seat {
  status: SeatStatus;
  lastSeenAt: number;
}

export interface Player {
  id: PlayerId;
  nickname: string;
  team: TeamId | null;
  role: Role;
  ready: boolean;
  seat: Seat;
  joinedAt: number;
  joinedAtTurn: number | null;
  /** Has seen the key (was a spymaster). May not guess or play cards. */
  keyTainted: boolean;
}

export interface CardInstance {
  id: string;
  defId: string;
  drawnBy?: PlayerId;
  drawnAtTurn: number;
}

export interface InfoResult {
  id: string;
  cardDefId: string;
  turnIndex: number;
  tiles: TileId[];
  result: string;
}

export interface Team {
  id: TeamId;
  wordsTotal: number;
  wordsRemaining: number;
  deck: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  playedThisTurn: boolean;
  oncePerGameUsed: string[];
  knownOwners: Partial<Record<TileId, Owner>>;
  infoResults: InfoResult[];
}

export interface WordTile {
  id: TileId;
  word: string;
  position: number;
  revealed: boolean;
  revealedBy?: TeamId;
  revealedAtTurn?: number;
}

/** SPYMASTER ONLY. Index = tile id. */
export interface KeyCard {
  owners: Owner[];
  startingTeam: TeamId;
}

export interface Clue {
  word: string;
  count: number;
  givenBy: PlayerId;
}

export interface Turn {
  index: number;
  team: TeamId;
  phase: Phase;
  clue: Clue | null;
  guessesAllowed: number | 'unlimited';
  guessesMade: number;
  guessesRemaining: number | 'unlimited';
  /** Extra guesses granted this turn from any source (capped). */
  extraGuessesGranted: number;
  lastRevealedTileId: TileId | null;
  startedAt: number;
  /** Shared "considering this word" marks by active operatives; cleared on reveal and at turn end. */
  marks: Partial<Record<TileId, PlayerId[]>>;
}

export type EffectKind =
  | 'lock'
  | 'shield'
  | 'immunity'
  | 'hide_text'
  | 'banked_guesses'
  | 'forgive'
  | 'extra_draw'
  | 'guess_penalty';

export interface ActiveEffect {
  id: string;
  sourceCardDefId: string;
  ownerTeam: TeamId;
  kind: EffectKind;
  tileId?: TileId;
  /** Team the effect applies against / for. `both` for symmetric locks. */
  forTeam?: TeamId | 'both';
  value?: number;
  createdAtTurn: number;
  /**
   * Board effects (lock/shield/immunity/hide_text/forgive) are active while `turn.index <= expiresAtTurn`.
   * Deferred effects (banked_guesses/extra_draw/guess_penalty) fire at TURN_START when `turn.index === expiresAtTurn`.
   * `null` = permanent.
   */
  expiresAtTurn: number | null;
  visibility: 'public' | 'team';
}

export interface GameResult {
  winner: TeamId;
  reason: 'all_words' | 'assassin' | 'forfeit';
}

export interface GameState {
  roomCode: string;
  status: GameStatus;
  settings: GameSettings;
  seed: string;
  rngState: [number, number, number, number];
  hostId: PlayerId | null;
  players: Record<PlayerId, Player>;
  teams: Record<TeamId, Team>;
  tiles: WordTile[];
  key: KeyCard | null;
  turn: Turn | null;
  activeEffects: ActiveEffect[];
  result: GameResult | null;
  /** Monotonic event sequence for this room. */
  eventSeq: number;
  /** Counter for deterministic ids (players, cards, effects). */
  nextId: number;
  createdAt: number;
  updatedAt: number;
}

/** Room cap: up to 50 operatives per team plus one spymaster each. */
export const MAX_OPERATIVES_PER_TEAM = 50;
export const MAX_PLAYERS = MAX_OPERATIVES_PER_TEAM * 2 + 2;
/** Two teams, each with one spymaster and at least one operative. */
export const MIN_PLAYERS = 4;
export const BOARD_SIZE = 25;
export const MAX_EXTRA_GUESSES_PER_TURN = 2;
