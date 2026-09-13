import { z } from 'zod';
import {
  GameStatusSchema,
  OwnerSchema,
  PhaseSchema,
  PlayerIdSchema,
  RoleSchema,
  SeatStatusSchema,
  TeamIdSchema,
  TileIdSchema,
} from './ids';
import { CardDefinitionViewSchema, CardInstanceViewSchema, PlayabilitySchema } from './cards';
import { GameSettingsSchema } from './settings';

export const PublicPlayerSchema = z
  .object({
    id: PlayerIdSchema,
    nickname: z.string(),
    team: TeamIdSchema.nullable(),
    role: RoleSchema,
    ready: z.boolean(),
    seat: SeatStatusSchema,
    keyTainted: z.boolean(),
    isHost: z.boolean(),
  })
  .strict();
export type PublicPlayer = z.infer<typeof PublicPlayerSchema>;

export const PublicTeamSchema = z
  .object({
    id: TeamIdSchema,
    wordsTotal: z.number().int(),
    wordsRemaining: z.number().int(),
    deckCount: z.number().int(),
    handCount: z.number().int(),
    /** Def ids of played cards, oldest first. Public by name only. */
    discard: z.array(z.string()),
    playedThisTurn: z.boolean(),
  })
  .strict();
export type PublicTeam = z.infer<typeof PublicTeamSchema>;

export const PublicTileSchema = z
  .object({
    id: TileIdSchema,
    word: z.string(),
    /** Grid position 0..24 (may differ from id after swaps). */
    position: z.number().int().min(0).max(24),
    revealed: z.boolean(),
    /** Present only when revealed. Never carries the hidden key. */
    owner: OwnerSchema.optional(),
    revealedBy: TeamIdSchema.optional(),
    /** Team that may NOT select this tile right now. */
    lockedFor: TeamIdSchema.optional(),
    shieldedBy: TeamIdSchema.optional(),
    /** Team whose operatives cannot read the word right now. */
    hiddenTextFor: TeamIdSchema.optional(),
  })
  .strict();
export type PublicTile = z.infer<typeof PublicTileSchema>;

export const PublicEffectSchema = z
  .object({
    id: z.string(),
    kind: z.enum(['lock', 'shield', 'immunity', 'hide_text', 'banked_guesses', 'forgive', 'extra_draw', 'guess_penalty']),
    sourceCardDefId: z.string(),
    ownerTeam: TeamIdSchema,
    tileId: TileIdSchema.optional(),
    forTeam: TeamIdSchema.optional(),
    value: z.number().int().optional(),
    expiresAtTurn: z.number().int().nullable(),
  })
  .strict();
export type PublicEffect = z.infer<typeof PublicEffectSchema>;

export const ClueViewSchema = z
  .object({ word: z.string(), count: z.number().int(), givenBy: PlayerIdSchema })
  .strict();
export type ClueView = z.infer<typeof ClueViewSchema>;

export const PublicTurnSchema = z
  .object({
    index: z.number().int(),
    team: TeamIdSchema,
    phase: PhaseSchema,
    clue: ClueViewSchema.nullable(),
    guessesAllowed: z.union([z.number().int(), z.literal('unlimited')]),
    guessesMade: z.number().int(),
    guessesRemaining: z.union([z.number().int(), z.literal('unlimited')]),
    forgiveAvailable: z.boolean(),
    startedAt: z.number(),
    /** Tile id (as string) -> players currently marking it. Public to everyone at the table. */
    marks: z.record(z.string(), z.array(PlayerIdSchema)),
  })
  .strict();
export type PublicTurn = z.infer<typeof PublicTurnSchema>;

export const GameResultSchema = z
  .object({
    winner: TeamIdSchema,
    reason: z.enum(['all_words', 'assassin', 'forfeit']),
    /** Full key, index = tile id. Only ever present after the game ends. */
    key: z.array(OwnerSchema).length(25),
  })
  .strict();
export type GameResult = z.infer<typeof GameResultSchema>;

export const PublicViewSchema = z
  .object({
    roomCode: z.string(),
    status: GameStatusSchema,
    settings: GameSettingsSchema,
    hostId: PlayerIdSchema.nullable(),
    players: z.array(PublicPlayerSchema),
    teams: z.object({ ember: PublicTeamSchema, tide: PublicTeamSchema }).strict(),
    tiles: z.array(PublicTileSchema),
    startingTeam: TeamIdSchema.nullable(),
    turn: PublicTurnSchema.nullable(),
    effects: z.array(PublicEffectSchema),
    result: GameResultSchema.nullable(),
    /** Card catalog for the enabled pool, so the client renders cards purely from data. */
    cardCatalog: z.record(z.string(), CardDefinitionViewSchema),
    seq: z.number().int(),
  })
  .strict();
export type PublicView = z.infer<typeof PublicViewSchema>;

export const InfoResultSchema = z
  .object({
    id: z.string(),
    cardDefId: z.string(),
    turnIndex: z.number().int(),
    tiles: z.array(TileIdSchema),
    /** Short machine string: 'yes' | 'no' | '0' | '1' | '2+' | 'odd' | 'even' | 'safe' | 'danger' | digit */
    result: z.string(),
  })
  .strict();
export type InfoResult = z.infer<typeof InfoResultSchema>;

export const TeamViewSchema = z
  .object({
    team: TeamIdSchema,
    hand: z.array(CardInstanceViewSchema),
    playability: z.record(z.string(), PlayabilitySchema),
    /** Owners this team learned through cards. Keys are tile ids as strings. */
    knownOwners: z.record(z.string(), OwnerSchema),
    infoResults: z.array(InfoResultSchema),
  })
  .strict();
export type TeamView = z.infer<typeof TeamViewSchema>;

export const PrivateViewSchema = z
  .object({
    playerId: PlayerIdSchema,
    role: RoleSchema,
    team: TeamIdSchema.nullable(),
    isHost: z.boolean(),
  })
  .strict();
export type PrivateView = z.infer<typeof PrivateViewSchema>;

export const SpymasterViewSchema = z
  .object({
    /** Full key, index = tile id. */
    key: z.array(OwnerSchema).length(25),
  })
  .strict();
export type SpymasterView = z.infer<typeof SpymasterViewSchema>;

export const ClientViewSchema = z
  .object({
    public: PublicViewSchema,
    me: PrivateViewSchema,
    team: TeamViewSchema.nullable(),
    spymaster: SpymasterViewSchema.nullable(),
  })
  .strict();
export type ClientView = z.infer<typeof ClientViewSchema>;
