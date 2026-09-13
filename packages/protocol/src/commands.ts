import { z } from 'zod';
import { NicknameSchema, PlayerIdSchema, RoleSchema, TeamIdSchema, TileIdSchema } from './ids';
import { CardTargetSchema } from './cards';
import { SettingsPatchSchema } from './settings';

const turnIndex = z.number().int().min(0);

/** Client -> server commands. The WebSocket is already scoped to one room (`/ws/:code`). */
export const CommandSchema = z.discriminatedUnion('type', [
  /** Reconnect with a previously issued session token. */
  z.object({ type: z.literal('HELLO'), sessionToken: z.string().regex(/^[0-9a-f]{32}$/) }).strict(),
  /** Join as a new player. The first player to join a fresh room becomes host. */
  z.object({ type: z.literal('JOIN_GAME'), nickname: NicknameSchema }).strict(),
  z.object({ type: z.literal('LEAVE') }).strict(),
  z.object({ type: z.literal('SET_TEAM'), team: TeamIdSchema.nullable() }).strict(),
  z.object({ type: z.literal('SET_ROLE'), role: RoleSchema }).strict(),
  z.object({ type: z.literal('TOGGLE_READY') }).strict(),
  z.object({ type: z.literal('START_GAME'), settings: SettingsPatchSchema.optional() }).strict(),
  z
    .object({
      type: z.literal('GIVE_CLUE'),
      word: z.string().trim().min(1).max(24),
      count: z.number().int().min(0).max(9),
      expectedTurnIndex: turnIndex,
    })
    .strict(),
  z
    .object({
      type: z.literal('PLAY_CARD'),
      cardInstanceId: z.string().min(1).max(64),
      target: CardTargetSchema.optional(),
      expectedTurnIndex: turnIndex,
    })
    .strict(),
  /** Toggle the sender's mark on a word: a shared "we are considering this" signal, not a guess. */
  z.object({ type: z.literal('MARK_WORD'), tileId: TileIdSchema, expectedTurnIndex: turnIndex }).strict(),
  /** The actual guess: reveals the word. */
  z.object({ type: z.literal('SELECT_WORD'), tileId: TileIdSchema, expectedTurnIndex: turnIndex }).strict(),
  z.object({ type: z.literal('END_TURN'), expectedTurnIndex: turnIndex }).strict(),
  z.object({ type: z.literal('PROMOTE_SPYMASTER'), playerId: PlayerIdSchema }).strict(),
  z.object({ type: z.literal('REQUEST_REMATCH') }).strict(),
  z.object({ type: z.literal('RESYNC') }).strict(),
]);
export type Command = z.infer<typeof CommandSchema>;
export type CommandType = Command['type'];

export const ClientEnvelopeSchema = z
  .object({
    v: z.literal(1),
    /** Client-generated id used for ACK/ERROR correlation and server-side dedupe. */
    commandId: z.string().min(8).max(64),
    command: CommandSchema,
  })
  .strict();
export type ClientEnvelope = z.infer<typeof ClientEnvelopeSchema>;

/** Hard cap on an incoming frame, checked before JSON.parse. */
export const MAX_FRAME_BYTES = 4096;
