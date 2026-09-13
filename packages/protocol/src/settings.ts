import { z } from 'zod';

export const CardPoolSchema = z.enum(['none', 'mvp', 'full']);
export type CardPool = z.infer<typeof CardPoolSchema>;

export const GameSettingsSchema = z
  .object({
    cardPool: CardPoolSchema,
    handMax: z.number().int().min(1).max(6),
    openingHand: z.number().int().min(0).max(4),
    deckSize: z.number().int().min(6).max(60),
    wordList: z.enum(['en']),
    /** Seconds the guessing team has per turn; 0 disables the timer. */
    turnTimerSec: z.number().int().min(0).max(600),
  })
  .strict();
export type GameSettings = z.infer<typeof GameSettingsSchema>;

export const DEFAULT_SETTINGS: GameSettings = {
  cardPool: 'mvp',
  handMax: 4,
  openingHand: 2,
  deckSize: 24,
  wordList: 'en',
  turnTimerSec: 0,
};

/** Partial settings a host may send with START_GAME; missing fields fall back to defaults. */
export const SettingsPatchSchema = GameSettingsSchema.partial().strict();
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;
