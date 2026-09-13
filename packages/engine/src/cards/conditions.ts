import type { ErrorCode, TeamId } from '@gambit/protocol';
import type { GameState } from '../state';
import type { CardDefinition, Condition } from './types';
import { CARD_CONFIG } from './config';
import { unrevealedTiles } from '../board/tiles';

export interface ConditionFailure {
  code: ErrorCode;
  reason: string;
}

/** Why a card cannot be played right now, or null if it can (ignoring targets). */
export const checkPlayable = (state: GameState, team: TeamId, def: CardDefinition): ConditionFailure | null => {
  const turn = state.turn;
  if (state.status !== 'in_game' || !turn) return { code: 'WRONG_STATUS', reason: 'The game is not running.' };
  if (turn.team !== team) return { code: 'NOT_YOUR_TURN', reason: 'Not your team’s turn.' };
  if (turn.phase !== 'guess') return { code: 'WRONG_PHASE', reason: 'Wait for the clue.' };
  const t = state.teams[team];
  if (t.playedThisTurn && CARD_CONFIG.playsPerTurn <= 1) return { code: 'ALREADY_PLAYED', reason: 'One card per turn.' };
  const cost = def.cost.guesses ?? 0;
  if (cost > 0) {
    if (turn.guessesRemaining !== 'unlimited' && turn.guessesRemaining - cost < 1) {
      return { code: 'COST_UNPAYABLE', reason: `Needs ${cost + 1} guesses remaining.` };
    }
  }
  if ((def.cost.discard ?? 0) > 0 && t.hand.length - 1 < (def.cost.discard ?? 0)) {
    return { code: 'COST_UNPAYABLE', reason: 'Not enough cards to discard.' };
  }
  for (const c of def.conditions) {
    const f = checkCondition(state, team, def, c);
    if (f) return f;
  }
  return null;
};

const checkCondition = (state: GameState, team: TeamId, def: CardDefinition, c: Condition): ConditionFailure | null => {
  const turn = state.turn!;
  const t = state.teams[team];
  switch (c.kind) {
    case 'min_guesses_remaining':
      if (turn.guessesRemaining !== 'unlimited' && turn.guessesRemaining < c.n)
        return { code: 'CONDITION_FAILED', reason: `Needs ${c.n} guesses remaining.` };
      return null;
    case 'min_own_words_remaining':
      if (t.wordsRemaining < c.n) return { code: 'CONDITION_FAILED', reason: `Needs ${c.n} of your words unrevealed.` };
      return null;
    case 'hand_size_at_least':
      if (t.hand.length < c.n) return { code: 'CONDITION_FAILED', reason: `Needs ${c.n} cards in hand.` };
      return null;
    case 'hand_not_full':
      if (t.hand.length - 1 >= state.settings.handMax) return { code: 'CONDITION_FAILED', reason: 'Hand is full.' };
      return null;
    case 'once_per_game_per_team':
      if (t.oncePerGameUsed.includes(def.id)) return { code: 'CONDITION_FAILED', reason: 'Once per game.' };
      return null;
    case 'discard_not_empty':
      if (t.discard.length === 0) return { code: 'CONDITION_FAILED', reason: 'Discard pile is empty.' };
      return null;
    case 'clue_not_unlimited':
      if (turn.guessesAllowed === 'unlimited') return { code: 'CONDITION_FAILED', reason: 'Guesses are already unlimited.' };
      return null;
    case 'no_forgive_active':
      if (state.activeEffects.some((e) => e.kind === 'forgive' && e.ownerTeam === team && e.expiresAtTurn === turn.index))
        return { code: 'CONDITION_FAILED', reason: 'Already protected this turn.' };
      return null;
    case 'min_unrevealed_tiles':
      if (unrevealedTiles(state.tiles).length < c.n) return { code: 'CONDITION_FAILED', reason: 'Not enough words left.' };
      return null;
  }
};
