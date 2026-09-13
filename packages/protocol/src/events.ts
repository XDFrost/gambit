import { z } from 'zod';
import { OwnerSchema, PlayerIdSchema, TeamIdSchema, TileIdSchema } from './ids';
import { CardInstanceViewSchema, CardTargetSchema, CostSchema } from './cards';
import { ClientViewSchema, GameResultSchema, PublicEffectSchema, PublicPlayerSchema } from './views';
import { ERROR_CODES } from './codes';

/** Server -> client events. Payloads are already scoped for the recipient. */
export const EventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('SESSION'), playerId: PlayerIdSchema, sessionToken: z.string() }).strict(),
  z.object({ type: z.literal('STATE_SNAPSHOT'), view: ClientViewSchema }).strict(),
  z.object({ type: z.literal('PLAYER_JOINED'), player: PublicPlayerSchema }).strict(),
  z.object({ type: z.literal('PLAYER_LEFT'), playerId: PlayerIdSchema, nickname: z.string() }).strict(),
  z.object({ type: z.literal('PLAYER_UPDATED'), player: PublicPlayerSchema }).strict(),
  z.object({ type: z.literal('PLAYER_DISCONNECTED'), playerId: PlayerIdSchema }).strict(),
  z.object({ type: z.literal('PLAYER_RECONNECTED'), playerId: PlayerIdSchema }).strict(),
  z.object({ type: z.literal('GAME_STARTED'), startingTeam: TeamIdSchema }).strict(),
  z
    .object({
      type: z.literal('TURN_STARTED'),
      turnIndex: z.number().int(),
      team: TeamIdSchema,
      bankedGuesses: z.number().int(),
    })
    .strict(),
  z
    .object({
      type: z.literal('CLUE_GIVEN'),
      team: TeamIdSchema,
      word: z.string(),
      count: z.number().int(),
      guessesAllowed: z.union([z.number().int(), z.literal('unlimited')]),
    })
    .strict(),
  /** Full card for the drawing team; other recipients receive the count-only variant. */
  z
    .object({
      type: z.literal('CARD_DRAWN'),
      team: TeamIdSchema,
      reason: z.enum(['opening', 'turn_start', 'effect']),
      card: CardInstanceViewSchema.optional(),
      deckCount: z.number().int(),
      handCount: z.number().int(),
    })
    .strict(),
  z
    .object({
      type: z.literal('CARD_PLAYED'),
      team: TeamIdSchema,
      by: PlayerIdSchema,
      cardDefId: z.string(),
      target: CardTargetSchema.optional(),
      costPaid: CostSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('EFFECT_APPLIED'),
      cardDefId: z.string(),
      team: TeamIdSchema,
      /** Public description of what changed. */
      kind: z.enum(['effect', 'guesses', 'draw', 'reveal', 'swap', 'info', 'none']),
      effect: PublicEffectSchema.optional(),
      delta: z.number().int().optional(),
      tiles: z.array(TileIdSchema).optional(),
    })
    .strict(),
  /** Team-scoped result of an information card. Never has a public variant with the answer. */
  z
    .object({
      type: z.literal('INFO_REVEALED'),
      cardDefId: z.string(),
      tiles: z.array(TileIdSchema),
      result: z.string(),
      knownOwners: z.record(z.string(), OwnerSchema).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('WORD_MARKED'),
      tileId: TileIdSchema,
      by: PlayerIdSchema,
      marked: z.boolean(),
      /** Everyone currently marking this word, after the toggle. */
      marks: z.array(PlayerIdSchema),
    })
    .strict(),
  z
    .object({
      type: z.literal('WORD_REVEALED'),
      tileId: TileIdSchema,
      word: z.string(),
      owner: OwnerSchema,
      by: PlayerIdSchema.nullable(),
      team: TeamIdSchema,
      outcome: z.enum(['continue', 'turn_end', 'forgiven', 'game_over', 'card']),
    })
    .strict(),
  z
    .object({
      type: z.literal('TURN_ENDED'),
      turnIndex: z.number().int(),
      team: TeamIdSchema,
      reason: z.enum(['wrong_guess', 'exhausted', 'voluntary', 'card', 'timeout']),
    })
    .strict(),
  z.object({ type: z.literal('GAME_OVER'), result: GameResultSchema }).strict(),
  z.object({ type: z.literal('SPYMASTER_VACANT'), team: TeamIdSchema }).strict(),
  z.object({ type: z.literal('GAME_RESET') }).strict(),
  z
    .object({
      type: z.literal('ERROR'),
      code: z.enum(ERROR_CODES),
      message: z.string(),
      replyTo: z.string().optional(),
    })
    .strict(),
  z.object({ type: z.literal('ACK'), replyTo: z.string() }).strict(),
]);
export type Event = z.infer<typeof EventSchema>;
export type EventType = Event['type'];
export type EventOf<T extends EventType> = Extract<Event, { type: T }>;

export const ServerEnvelopeSchema = z
  .object({
    v: z.literal(1),
    /** Per-room monotonic sequence. Connection-level frames (ERROR, ACK, SESSION) carry the latest seq. */
    seq: z.number().int().min(0),
    ts: z.number(),
    event: EventSchema,
  })
  .strict();
export type ServerEnvelope = z.infer<typeof ServerEnvelopeSchema>;
