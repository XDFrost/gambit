import type { Duration, TeamId, TileId } from '@gambit/protocol';
import { otherTeam } from '@gambit/protocol';
import type { Ctx } from '../game/apply';
import { nextId } from '../game/create';
import type { ActiveEffect, EffectKind, GameState } from '../state';

/** Turn index at which an effect created on `turnIndex` stops applying (inclusive). */
export const expiryFor = (duration: Duration, turnIndex: number): number | null => {
  switch (duration) {
    case 'instant':
    case 'this_turn':
      return turnIndex;
    case 'opponent_next_turn':
      return turnIndex + 1;
    case 'own_next_turn':
    case 'until_own_next_turn_end':
      return turnIndex + 2;
    case 'permanent':
      return null;
  }
};

export const addEffect = (
  ctx: Ctx,
  partial: Omit<ActiveEffect, 'id' | 'createdAtTurn'>,
): ActiveEffect => {
  const effect: ActiveEffect = {
    id: nextId(ctx.state, 'fx'),
    createdAtTurn: ctx.state.turn?.index ?? 0,
    ...partial,
  };
  ctx.state.activeEffects.push(effect);
  return effect;
};

export const findEffect = (state: GameState, pred: (e: ActiveEffect) => boolean): ActiveEffect | undefined =>
  state.activeEffects.find(pred);

const BOARD_KINDS: ReadonlySet<EffectKind> = new Set(['lock', 'shield', 'immunity', 'hide_text', 'forgive']);

/** Remove board effects whose window has passed. Called at the start of every turn. */
export const expireEffects = (ctx: Ctx, newTurnIndex: number): void => {
  ctx.state.activeEffects = ctx.state.activeEffects.filter(
    (e) => !(BOARD_KINDS.has(e.kind) && e.expiresAtTurn !== null && e.expiresAtTurn < newTurnIndex),
  );
};

/** Sum and remove deferred effects of `kind` for `team` scheduled for `turnIndex`. */
export const consumeDeferredEffects = (ctx: Ctx, team: TeamId, turnIndex: number, kind: EffectKind): number => {
  let total = 0;
  ctx.state.activeEffects = ctx.state.activeEffects.filter((e) => {
    if (e.kind !== kind || e.ownerTeam !== team || e.expiresAtTurn !== turnIndex) return true;
    total += e.value ?? 0;
    return false;
  });
  return total;
};

export const isLockedFor = (state: GameState, tileId: TileId, team: TeamId): boolean =>
  state.activeEffects.some(
    (e) =>
      e.kind === 'lock' &&
      e.tileId === tileId &&
      (e.forTeam === 'both' || e.forTeam === team) &&
      (e.expiresAtTurn === null || (state.turn?.index ?? 0) <= e.expiresAtTurn),
  );

/** Is this tile protected against card effects played by `actingTeam`? */
export const isShieldedAgainst = (state: GameState, tileId: TileId, actingTeam: TeamId): boolean => {
  const opp = otherTeam(actingTeam);
  const idx = state.turn?.index ?? 0;
  const live = (e: ActiveEffect) => e.expiresAtTurn === null || idx <= e.expiresAtTurn;
  if (state.activeEffects.some((e) => e.kind === 'shield' && e.tileId === tileId && e.ownerTeam === opp && live(e))) return true;
  if (state.activeEffects.some((e) => e.kind === 'immunity' && e.ownerTeam === opp && live(e))) {
    // Immunity protects the opponent's own words; the acting team does not know which those are,
    // so it protects every unrevealed tile that belongs to them.
    const owner = state.key?.owners[tileId];
    if (owner === opp) return true;
  }
  return false;
};

export const lockedForOf = (state: GameState, tileId: TileId): TeamId | undefined => {
  const idx = state.turn?.index ?? 0;
  const e = state.activeEffects.find(
    (x) => x.kind === 'lock' && x.tileId === tileId && (x.expiresAtTurn === null || idx <= x.expiresAtTurn),
  );
  if (!e) return undefined;
  return e.forTeam === 'both' ? undefined : (e.forTeam as TeamId | undefined);
};

export const shieldedByOf = (state: GameState, tileId: TileId): TeamId | undefined => {
  const idx = state.turn?.index ?? 0;
  return state.activeEffects.find(
    (x) => x.kind === 'shield' && x.tileId === tileId && (x.expiresAtTurn === null || idx <= x.expiresAtTurn),
  )?.ownerTeam;
};

export const hiddenTextForOf = (state: GameState, tileId: TileId): TeamId | undefined => {
  const idx = state.turn?.index ?? 0;
  const e = state.activeEffects.find(
    (x) => x.kind === 'hide_text' && x.tileId === tileId && (x.expiresAtTurn === null || idx <= x.expiresAtTurn),
  );
  return e?.forTeam === 'both' ? undefined : (e?.forTeam as TeamId | undefined);
};
