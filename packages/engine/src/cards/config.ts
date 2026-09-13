import type { Rarity } from '@gambit/protocol';

/** Balance levers. Everything tunable about the card economy lives here. */
export const CARD_CONFIG = {
  /** Copies of each card added to the deck-build pool, by rarity. */
  copiesByRarity: { common: 3, uncommon: 2, rare: 1 } satisfies Record<Rarity, number>,
  /** Maximum card plays per team per turn. */
  playsPerTurn: 1,
  /** Whether information-card results are also broadcast publicly (default: team-private). */
  infoResultsPublic: false,
} as const;
