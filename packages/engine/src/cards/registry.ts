import type { CardDefinitionView, CardPool } from '@gambit/protocol';
import type { CardDefinition } from './types';
import { ALL_CARDS } from './definitions';

const byId: ReadonlyMap<string, CardDefinition> = new Map(ALL_CARDS.map((c) => [c.id, c]));

export const getCard = (id: string): CardDefinition => {
  const def = byId.get(id);
  if (!def) throw new Error(`Unknown card ${id}`);
  return def;
};

export const hasCard = (id: string): boolean => byId.has(id);

export const poolDefinitions = (pool: CardPool): CardDefinition[] =>
  pool === 'none' ? [] : ALL_CARDS.filter((c) => c.pools.includes(pool));

/** Strip engine-only fields so a definition can be sent to clients. */
export const toView = (def: CardDefinition): CardDefinitionView => ({
  id: def.id,
  name: def.name,
  category: def.category,
  rarity: def.rarity,
  description: def.description,
  rulesText: def.rulesText,
  targeting: def.targeting,
  cost: def.cost,
  duration: def.duration,
  presentation: def.presentation,
});

export const catalogFor = (pool: CardPool): Record<string, CardDefinitionView> =>
  Object.fromEntries(poolDefinitions(pool).map((d) => [d.id, toView(d)]));
