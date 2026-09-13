import type { TeamId } from '@gambit/protocol';
import type { Ctx } from '../game/apply';
import { nextId } from '../game/create';
import type { CardInstance } from '../state';
import { CARD_CONFIG } from './config';
import { poolDefinitions } from './registry';

/** Build a shuffled team deck from the enabled pool using rarity copy counts. */
export const buildDeck = (ctx: Ctx, team: TeamId): CardInstance[] => {
  const { state, rng } = ctx;
  const defs = poolDefinitions(state.settings.cardPool);
  if (defs.length === 0) return [];
  const pool: string[] = [];
  for (const def of defs) {
    const copies = CARD_CONFIG.copiesByRarity[def.rarity];
    for (let i = 0; i < copies; i++) pool.push(def.id);
  }
  // Fill up to deckSize by cycling the shuffled pool so small pools still make a full deck.
  const shuffled = rng.shuffle(pool);
  const ids: string[] = [];
  while (ids.length < state.settings.deckSize) {
    for (const id of shuffled) {
      if (ids.length >= state.settings.deckSize) break;
      ids.push(id);
    }
  }
  return rng.shuffle(ids).map((defId) => ({ id: nextId(state, `${team[0]}c`), defId, drawnAtTurn: -1 }));
};

/** Draw up to `n` cards for a team, reshuffling the discard into the deck when empty. */
export const drawCards = (ctx: Ctx, team: TeamId, n: number, reason: 'opening' | 'turn_start' | 'effect'): CardInstance[] => {
  const { state } = ctx;
  const t = state.teams[team];
  const drawn: CardInstance[] = [];
  for (let i = 0; i < n; i++) {
    if (t.hand.length >= state.settings.handMax) break;
    if (t.deck.length === 0) {
      if (t.discard.length === 0) break;
      t.deck = ctx.rng.shuffle(t.discard);
      t.discard = [];
    }
    const card = t.deck.shift()!;
    card.drawnAtTurn = state.turn?.index ?? 0;
    t.hand.push(card);
    drawn.push(card);
    ctx.sink.team(
      team,
      { type: 'CARD_DRAWN', team, reason, card: { id: card.id, defId: card.defId }, deckCount: t.deck.length, handCount: t.hand.length },
      { type: 'CARD_DRAWN', team, reason, deckCount: t.deck.length, handCount: t.hand.length },
    );
  }
  return drawn;
};
