import type { CardTarget, TeamId, TileFilter, TileId } from '@gambit/protocol';
import { fail } from '../errors';
import type { GameState } from '../state';
import type { CardDefinition } from './types';
import { block2x2, rowTiles, tileById } from '../board/tiles';
import { isLockedFor, isShieldedAgainst } from './effects';

/** Tile ids the acting team may pick for a single-tile filter. */
export const validTilesFor = (state: GameState, team: TeamId, filter: TileFilter): TileId[] =>
  state.tiles
    .filter((t) => !t.revealed)
    .filter((t) => !(filter.notShielded && isShieldedAgainst(state, t.id, team)))
    .filter((t) => !(filter.notLocked && isLockedFor(state, t.id, team)))
    .map((t) => t.id);

export interface ResolvedTarget {
  tiles: TileId[];
  handCardId?: string;
  category?: CardTarget['category'];
}

/** Validate a submitted target against the card's targeting spec. Throws TARGET_INVALID. */
export const resolveTarget = (state: GameState, team: TeamId, def: CardDefinition, target: CardTarget | undefined): ResolvedTarget => {
  const spec = def.targeting;
  const t = target ?? {};
  switch (spec.kind) {
    case 'none':
      return { tiles: [] };
    case 'tile': {
      const ids = t.tiles ?? [];
      if (ids.length !== 1) return fail('TARGET_INVALID', 'Choose one word.');
      const valid = validTilesFor(state, team, spec.filter);
      if (!valid.includes(ids[0]!)) return fail('TARGET_INVALID');
      return { tiles: [ids[0]!] };
    }
    case 'two_tiles': {
      const ids = t.tiles ?? [];
      if (ids.length !== 2 || ids[0] === ids[1]) return fail('TARGET_INVALID', 'Choose two different words.');
      const valid = validTilesFor(state, team, spec.filter);
      if (!ids.every((id) => valid.includes(id))) return fail('TARGET_INVALID');
      return { tiles: [ids[0]!, ids[1]!] };
    }
    case 'row': {
      if (t.row === undefined) return fail('TARGET_INVALID', 'Choose a row.');
      const ids = rowTiles(state.tiles, t.row).filter((id) => !tileById(state.tiles, id).revealed);
      if (ids.length < 2) return fail('TARGET_INVALID', 'That row has too few hidden words.');
      return { tiles: ids };
    }
    case 'block2x2': {
      if (t.block === undefined) return fail('TARGET_INVALID', 'Choose a 2x2 block.');
      const ids = block2x2(state.tiles, t.block);
      if (ids.length !== 4) return fail('TARGET_INVALID', 'Anchor must not be on the last row or column.');
      return { tiles: ids };
    }
    case 'hand_card': {
      if (!t.handCardId) return fail('TARGET_INVALID', 'Choose a card from your hand.');
      const inHand = state.teams[team].hand.some((c) => c.id === t.handCardId);
      if (!inHand) return fail('TARGET_INVALID');
      const out: ResolvedTarget = { tiles: [], handCardId: t.handCardId };
      if (t.category) out.category = t.category;
      return out;
    }
    case 'discard_top':
      return { tiles: [] };
  }
};
