import { z } from 'zod';
import { TileIdSchema } from './ids';

export const CardCategorySchema = z.enum(['information', 'board', 'turn', 'gamble', 'team']);
export type CardCategory = z.infer<typeof CardCategorySchema>;

export const RaritySchema = z.enum(['common', 'uncommon', 'rare']);
export type Rarity = z.infer<typeof RaritySchema>;

export const DurationSchema = z.enum([
  'instant',
  'this_turn',
  'until_own_next_turn_end',
  'opponent_next_turn',
  'own_next_turn',
  'permanent',
]);
export type Duration = z.infer<typeof DurationSchema>;

export const TileFilterSchema = z
  .object({
    unrevealed: z.literal(true),
    notShielded: z.boolean().optional(),
    notLocked: z.boolean().optional(),
  })
  .strict();
export type TileFilter = z.infer<typeof TileFilterSchema>;

/** What a card needs the player to pick. Clients use this to drive targeting mode. */
export const TargetingSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }).strict(),
  z.object({ kind: z.literal('tile'), filter: TileFilterSchema }).strict(),
  z.object({ kind: z.literal('two_tiles'), filter: TileFilterSchema }).strict(),
  z.object({ kind: z.literal('row') }).strict(),
  z.object({ kind: z.literal('block2x2') }).strict(),
  z
    .object({
      kind: z.literal('hand_card'),
      filter: z.object({ notSelf: z.literal(true), category: CardCategorySchema.optional() }).strict(),
    })
    .strict(),
  z.object({ kind: z.literal('discard_top') }).strict(),
]);
export type Targeting = z.infer<typeof TargetingSchema>;

export const CostSchema = z
  .object({
    guesses: z.number().int().min(0).max(3).optional(),
    discard: z.number().int().min(0).max(2).optional(),
    endsTurn: z.boolean().optional(),
  })
  .strict();
export type Cost = z.infer<typeof CostSchema>;

export const CardPresentationSchema = z
  .object({
    /** Phosphor icon name rendered as the card glyph. */
    glyph: z.string().min(1),
    animation: z.string().min(1),
    sfx: z.string().min(1),
  })
  .strict();
export type CardPresentation = z.infer<typeof CardPresentationSchema>;

/** Everything a client is allowed to know about a card definition. Effects stay in the engine. */
export const CardDefinitionViewSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    category: CardCategorySchema,
    rarity: RaritySchema,
    description: z.string().min(1),
    rulesText: z.string().min(1),
    targeting: TargetingSchema,
    cost: CostSchema,
    duration: DurationSchema,
    presentation: CardPresentationSchema,
  })
  .strict();
export type CardDefinitionView = z.infer<typeof CardDefinitionViewSchema>;

export const CardInstanceViewSchema = z
  .object({
    id: z.string().min(1),
    defId: z.string().min(1),
  })
  .strict();
export type CardInstanceView = z.infer<typeof CardInstanceViewSchema>;

/** The target a client submits with PLAY_CARD. Shape depends on the card's Targeting. */
export const CardTargetSchema = z
  .object({
    tiles: z.array(TileIdSchema).min(1).max(2).optional(),
    row: z.number().int().min(0).max(4).optional(),
    block: TileIdSchema.optional(),
    handCardId: z.string().min(1).optional(),
    category: CardCategorySchema.optional(),
  })
  .strict();
export type CardTarget = z.infer<typeof CardTargetSchema>;

/** Server-computed: can this hand card be played right now, and where? */
export const PlayabilitySchema = z
  .object({
    playable: z.boolean(),
    reason: z.string().optional(),
    validTiles: z.array(TileIdSchema).optional(),
  })
  .strict();
export type Playability = z.infer<typeof PlayabilitySchema>;
