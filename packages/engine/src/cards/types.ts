import type { CardCategory, CardDefinitionView, Duration } from '@gambit/protocol';

/** Playable-when predicates. Evaluated server-side and also reported to clients as `playability`. */
export type Condition =
  | { kind: 'min_guesses_remaining'; n: number }
  | { kind: 'min_own_words_remaining'; n: number }
  | { kind: 'hand_size_at_least'; n: number }
  | { kind: 'hand_not_full' }
  | { kind: 'once_per_game_per_team' }
  | { kind: 'discard_not_empty' }
  | { kind: 'clue_not_unlimited' }
  | { kind: 'no_forgive_active' }
  | { kind: 'min_unrevealed_tiles'; n: number };

/**
 * The closed set of effect primitives. The engine implements exactly these; every card is a
 * composition of them. Adding a card never requires new engine code unless a whole family of
 * cards needs a new primitive.
 */
export type EffectOp =
  | { op: 'PEEK_TILE'; mode: 'is_own' | 'safe_or_danger' | 'exact_owner' }
  | { op: 'PEEK_ONE_OWN_OF_SUBSET'; subsetSize: number }
  | { op: 'PEEK_REGION_COUNT'; region: 'neighbors4' | 'row' | 'block2x2'; buckets: '0_1_2plus' | 'exact' | 'parity' }
  | { op: 'LOCK_TILE'; forTeam: 'opponent' | 'both'; duration: Duration }
  | { op: 'SHIELD_TILE'; duration: Duration }
  | { op: 'TEAM_IMMUNITY'; duration: Duration }
  | { op: 'SWAP_TILES' }
  | { op: 'REVEAL_TILE'; selector: 'random_neutral' | 'target' }
  | { op: 'HIDE_TILE_TEXT'; forTeam: 'opponent'; duration: Duration }
  | { op: 'MODIFY_GUESSES'; delta: number; when: 'now' | 'own_next_turn' | 'opponent_next_turn' }
  | { op: 'FORGIVE_WRONG_GUESS'; count: 1 }
  | { op: 'END_TURN' }
  | { op: 'RESOLVE_GUESSES'; bonusIfAllOwn: number }
  | { op: 'DRAW_CARDS'; team: 'own' | 'opponent'; n: number; when: 'now' | 'next_turn_start' }
  | { op: 'DISCARD_FROM_HAND'; selector: 'target' | 'random' }
  | { op: 'RECOVER_DISCARD'; n: 1 }
  | { op: 'SEARCH_DECK' }
  | { op: 'RANDOM_EVENT'; table: 'tremor' };

export interface CardDefinition extends CardDefinitionView {
  conditions: Condition[];
  effects: EffectOp[];
  cooldownTurns: number;
  /** Which pools include this card. */
  pools: Array<'mvp' | 'full'>;
  balanceNote: string;
}

export type { CardCategory };
