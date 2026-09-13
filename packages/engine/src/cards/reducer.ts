import type { Command } from '@gambit/protocol';
import { assert, fail } from '../errors';
import type { Ctx } from '../game/apply';
import { requireInGame, requireOperative, requireTurnIndex, endTurn } from '../turn/reducer';
import { getCard, hasCard } from './registry';
import { checkPlayable } from './conditions';
import { resolveTarget } from './targeting';
import { runEffects } from './interpret';

type PlayCard = Extract<Command, { type: 'PLAY_CARD' }>;

export const applyPlayCard = (ctx: Ctx, cmd: PlayCard): void => {
  const { state } = ctx;
  const turn = requireInGame(ctx);
  requireTurnIndex(turn, cmd.expectedTurnIndex);
  const p = requireOperative(ctx, turn);
  const team = state.teams[turn.team];

  const idx = team.hand.findIndex((c) => c.id === cmd.cardInstanceId);
  assert(idx >= 0, 'CARD_NOT_IN_HAND');
  const card = team.hand[idx]!;
  if (!hasCard(card.defId)) return fail('INTERNAL', `Unknown card ${card.defId}`);
  const def = getCard(card.defId);

  const failure = checkPlayable(state, turn.team, def);
  if (failure) return fail(failure.code, failure.reason);
  const target = resolveTarget(state, turn.team, def, cmd.target);
  if (target.handCardId === card.id) return fail('TARGET_INVALID', 'A card cannot target itself.');

  // Pay costs first so effects observe the paid state.
  const costPaid: { guesses?: number; discard?: number; endsTurn?: boolean } = {};
  if (def.cost.guesses && turn.guessesRemaining !== 'unlimited') {
    turn.guessesRemaining -= def.cost.guesses;
    costPaid.guesses = def.cost.guesses;
  }
  team.playedThisTurn = true;
  if (def.conditions.some((c) => c.kind === 'once_per_game_per_team')) team.oncePerGameUsed.push(def.id);
  // Take the card out of the hand now; it joins the discard after effects so RECOVER_DISCARD
  // cannot pull the card that is being played.
  team.hand.splice(idx, 1);

  ctx.sink.public({
    type: 'CARD_PLAYED',
    team: turn.team,
    by: p.id,
    cardDefId: def.id,
    ...(cmd.target ? { target: cmd.target } : {}),
    costPaid,
  });

  runEffects(ctx, { team: turn.team, by: p.id, def, target });
  if (def.cost.discard) costPaid.discard = def.cost.discard;

  state.teams[turn.team].discard.push(card);

  // A guess-cost that left zero guesses ends the turn (conditions normally prevent this).
  if (state.status === 'in_game' && state.turn === turn && turn.phase === 'guess' && turn.guessesRemaining === 0) {
    endTurn(ctx, 'exhausted');
  }
};
