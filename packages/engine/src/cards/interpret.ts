import type { Owner, TeamId, TileId } from '@gambit/protocol';
import { otherTeam } from '@gambit/protocol';
import type { Ctx } from '../game/apply';
import { nextId } from '../game/create';
import { neighbors4, rowTiles, tileById, unrevealedTiles } from '../board/tiles';
import type { CardDefinition, EffectOp } from './types';
import type { ResolvedTarget } from './targeting';
import { addEffect, expiryFor } from './effects';
import { drawCards } from './deck';
import { endTurn, resolveGuess } from '../turn/reducer';
import { MAX_EXTRA_GUESSES_PER_TURN } from '../state';
import { getCard } from './registry';

export interface EffectContext {
  team: TeamId;
  by: string;
  def: CardDefinition;
  target: ResolvedTarget;
}

/**
 * Run a card's effect primitives in order. Each primitive mutates state and emits events.
 * Returns false if the turn or game ended mid-way (remaining ops are skipped).
 */
export const runEffects = (ctx: Ctx, fx: EffectContext): void => {
  for (const op of fx.def.effects) {
    const cont = runOne(ctx, fx, op);
    if (!cont) return;
  }
};

const info = (ctx: Ctx, fx: EffectContext, tiles: TileId[], result: string, known?: Partial<Record<TileId, Owner>>) => {
  const team = ctx.state.teams[fx.team];
  const id = nextId(ctx.state, 'inf');
  team.infoResults.push({ id, cardDefId: fx.def.id, turnIndex: ctx.state.turn!.index, tiles, result });
  if (known) for (const [k, v] of Object.entries(known)) team.knownOwners[Number(k) as TileId] = v as Owner;
  const knownStr = known ? Object.fromEntries(Object.entries(known).map(([k, v]) => [k, v as Owner])) : undefined;
  const ev = { type: 'INFO_REVEALED' as const, cardDefId: fx.def.id, tiles, result, ...(knownStr ? { knownOwners: knownStr } : {}) };
  ctx.sink.team(fx.team, ev);
  // Everyone learns which tiles were examined, never the answer.
  ctx.sink.public({ type: 'EFFECT_APPLIED', cardDefId: fx.def.id, team: fx.team, kind: 'info', tiles });
};

const runOne = (ctx: Ctx, fx: EffectContext, op: EffectOp): boolean => {
  const { state } = ctx;
  const turn = state.turn!;
  const key = state.key!;
  const team = fx.team;
  const opp = otherTeam(team);
  const tid = (i: number): TileId => fx.target.tiles[i]!;
  const pub = (
    kind: 'effect' | 'guesses' | 'draw' | 'reveal' | 'swap' | 'none',
    extra: { delta?: number; tiles?: TileId[]; effectId?: string } = {},
  ) => {
    const eff = extra.effectId ? state.activeEffects.find((e) => e.id === extra.effectId) : undefined;
    ctx.sink.public({
      type: 'EFFECT_APPLIED',
      cardDefId: fx.def.id,
      team,
      kind,
      ...(eff
        ? {
            effect: {
              id: eff.id,
              kind: eff.kind,
              sourceCardDefId: eff.sourceCardDefId,
              ownerTeam: eff.ownerTeam,
              ...(eff.tileId !== undefined ? { tileId: eff.tileId } : {}),
              ...(eff.forTeam && eff.forTeam !== 'both' ? { forTeam: eff.forTeam } : {}),
              ...(eff.value !== undefined ? { value: eff.value } : {}),
              expiresAtTurn: eff.expiresAtTurn,
            },
          }
        : {}),
      ...(extra.delta !== undefined ? { delta: extra.delta } : {}),
      ...(extra.tiles ? { tiles: extra.tiles } : {}),
    });
  };

  switch (op.op) {
    case 'PEEK_TILE': {
      const id = tid(0);
      const owner = key.owners[id]!;
      if (op.mode === 'is_own') {
        const yes = owner === team;
        info(ctx, fx, [id], yes ? 'yes' : 'no', yes ? { [id]: owner } : undefined);
      } else if (op.mode === 'safe_or_danger') {
        info(ctx, fx, [id], owner === team || owner === 'neutral' ? 'safe' : 'danger');
      } else {
        info(ctx, fx, [id], owner, { [id]: owner });
      }
      return true;
    }
    case 'PEEK_ONE_OWN_OF_SUBSET': {
      const hidden = unrevealedTiles(state.tiles);
      const own = hidden.filter((t) => key.owners[t.id] === team);
      const others = hidden.filter((t) => key.owners[t.id] !== team);
      if (own.length === 0) {
        info(ctx, fx, [], 'none');
        return true;
      }
      const chosen = ctx.rng.pick(own);
      const fill = ctx.rng.shuffle(others).slice(0, Math.max(0, op.subsetSize - 1));
      const subset = ctx.rng.shuffle([chosen, ...fill]).map((t) => t.id);
      info(ctx, fx, subset, String(chosen.id), { [chosen.id]: team });
      return true;
    }
    case 'PEEK_REGION_COUNT': {
      let ids: TileId[];
      if (op.region === 'neighbors4') ids = neighbors4(state.tiles, tid(0)).filter((id) => !tileById(state.tiles, id).revealed);
      else if (op.region === 'row') ids = fx.target.tiles;
      else ids = fx.target.tiles.filter((id) => !tileById(state.tiles, id).revealed);
      const count = ids.filter((id) => key.owners[id] === team).length;
      const shown = op.region === 'neighbors4' ? [tid(0), ...ids] : ids;
      let result: string;
      if (op.buckets === 'exact') result = String(count);
      else if (op.buckets === 'parity') result = count % 2 === 0 ? 'even' : 'odd';
      else result = count >= 2 ? '2+' : String(count);
      info(ctx, fx, shown, result);
      return true;
    }
    case 'LOCK_TILE': {
      const e = addEffect(ctx, {
        sourceCardDefId: fx.def.id,
        ownerTeam: team,
        kind: 'lock',
        tileId: tid(0),
        forTeam: op.forTeam === 'both' ? 'both' : opp,
        expiresAtTurn: expiryFor(op.duration, turn.index),
        visibility: 'public',
      });
      pub('effect', { effectId: e.id, tiles: [tid(0)] });
      return true;
    }
    case 'SHIELD_TILE': {
      const e = addEffect(ctx, {
        sourceCardDefId: fx.def.id,
        ownerTeam: team,
        kind: 'shield',
        tileId: tid(0),
        expiresAtTurn: expiryFor(op.duration, turn.index),
        visibility: 'public',
      });
      pub('effect', { effectId: e.id, tiles: [tid(0)] });
      return true;
    }
    case 'TEAM_IMMUNITY': {
      const e = addEffect(ctx, {
        sourceCardDefId: fx.def.id,
        ownerTeam: team,
        kind: 'immunity',
        expiresAtTurn: expiryFor(op.duration, turn.index),
        visibility: 'public',
      });
      pub('effect', { effectId: e.id });
      return true;
    }
    case 'SWAP_TILES': {
      const a = tileById(state.tiles, tid(0));
      const b = tileById(state.tiles, tid(1));
      const pa = a.position;
      a.position = b.position;
      b.position = pa;
      pub('swap', { tiles: [a.id, b.id] });
      return true;
    }
    case 'REVEAL_TILE': {
      let id: TileId | undefined;
      if (op.selector === 'target') id = tid(0);
      else {
        const neutrals = unrevealedTiles(state.tiles).filter((t) => key.owners[t.id] === 'neutral');
        if (neutrals.length > 0) id = ctx.rng.pick(neutrals).id;
      }
      if (id === undefined) {
        pub('none');
        return true;
      }
      const tile = tileById(state.tiles, id);
      tile.revealed = true;
      tile.revealedAtTurn = turn.index;
      const owner = key.owners[id]!;
      if (owner === 'ember' || owner === 'tide') state.teams[owner].wordsRemaining -= 1;
      ctx.sink.public({ type: 'WORD_REVEALED', tileId: id, word: tile.word, owner, by: null, team, outcome: 'card' });
      pub('reveal', { tiles: [id] });
      return true;
    }
    case 'HIDE_TILE_TEXT': {
      const e = addEffect(ctx, {
        sourceCardDefId: fx.def.id,
        ownerTeam: team,
        kind: 'hide_text',
        tileId: tid(0),
        forTeam: opp,
        expiresAtTurn: expiryFor(op.duration, turn.index),
        visibility: 'public',
      });
      pub('effect', { effectId: e.id, tiles: [tid(0)] });
      return true;
    }
    case 'MODIFY_GUESSES': {
      if (op.when === 'now') {
        if (turn.guessesRemaining === 'unlimited') return true;
        const room = MAX_EXTRA_GUESSES_PER_TURN - turn.extraGuessesGranted;
        const delta = op.delta > 0 ? Math.min(op.delta, Math.max(0, room)) : op.delta;
        if (delta > 0) turn.extraGuessesGranted += delta;
        turn.guessesRemaining = Math.max(0, turn.guessesRemaining + delta);
        if (typeof turn.guessesAllowed === 'number') turn.guessesAllowed = Math.max(0, turn.guessesAllowed + delta);
        pub('guesses', { delta });
        return true;
      }
      const isOwn = op.when === 'own_next_turn';
      const e = addEffect(ctx, {
        sourceCardDefId: fx.def.id,
        ownerTeam: isOwn ? team : opp,
        kind: op.delta >= 0 ? 'banked_guesses' : 'guess_penalty',
        value: Math.abs(op.delta),
        expiresAtTurn: isOwn ? turn.index + 2 : turn.index + 1,
        visibility: 'public',
      });
      pub('effect', { effectId: e.id, delta: op.delta });
      return true;
    }
    case 'FORGIVE_WRONG_GUESS': {
      const e = addEffect(ctx, {
        sourceCardDefId: fx.def.id,
        ownerTeam: team,
        kind: 'forgive',
        value: op.count,
        expiresAtTurn: turn.index,
        visibility: 'public',
      });
      pub('effect', { effectId: e.id });
      return true;
    }
    case 'END_TURN': {
      endTurn(ctx, 'card');
      return false;
    }
    case 'RESOLVE_GUESSES': {
      let allOwn = true;
      for (const id of fx.target.tiles) {
        if (tileById(state.tiles, id).revealed) continue;
        const owner = key.owners[id];
        if (owner !== team) allOwn = false;
        const outcome = resolveGuess(ctx, id, fx.by, 'card');
        if (outcome === 'game_over' || outcome === 'turn_end') return false;
        if (outcome === 'forgiven') allOwn = false;
      }
      if (allOwn && op.bonusIfAllOwn > 0 && turn.guessesRemaining !== 'unlimited') {
        const room = MAX_EXTRA_GUESSES_PER_TURN - turn.extraGuessesGranted;
        const delta = Math.min(op.bonusIfAllOwn, Math.max(0, room));
        if (delta > 0) {
          turn.extraGuessesGranted += delta;
          turn.guessesRemaining += delta;
          if (typeof turn.guessesAllowed === 'number') turn.guessesAllowed += delta;
          pub('guesses', { delta });
        }
      }
      return true;
    }
    case 'DRAW_CARDS': {
      const target = op.team === 'own' ? team : opp;
      if (op.when === 'now') {
        drawCards(ctx, target, op.n, 'effect');
        pub('draw', { delta: op.n });
      } else {
        const e = addEffect(ctx, {
          sourceCardDefId: fx.def.id,
          ownerTeam: target,
          kind: 'extra_draw',
          value: op.n,
          expiresAtTurn: target === team ? turn.index + 2 : turn.index + 1,
          visibility: 'public',
        });
        pub('effect', { effectId: e.id, delta: op.n });
      }
      return true;
    }
    case 'DISCARD_FROM_HAND': {
      const t = state.teams[team];
      let idx = -1;
      if (op.selector === 'target') idx = t.hand.findIndex((c) => c.id === fx.target.handCardId);
      else if (t.hand.length > 0) idx = ctx.rng.int(t.hand.length);
      if (idx >= 0) {
        const [card] = t.hand.splice(idx, 1);
        t.discard.push(card!);
      }
      pub('effect');
      return true;
    }
    case 'RECOVER_DISCARD': {
      const t = state.teams[team];
      const card = t.discard.pop();
      if (card && t.hand.length < state.settings.handMax) {
        t.hand.push(card);
        ctx.sink.team(
          team,
          { type: 'CARD_DRAWN', team, reason: 'effect', card: { id: card.id, defId: card.defId }, deckCount: t.deck.length, handCount: t.hand.length },
          { type: 'CARD_DRAWN', team, reason: 'effect', deckCount: t.deck.length, handCount: t.hand.length },
        );
      } else if (card) {
        t.discard.push(card);
      }
      pub('draw', { delta: 1 });
      return true;
    }
    case 'SEARCH_DECK': {
      const t = state.teams[team];
      const category = fx.target.category;
      const idx = category ? t.deck.findIndex((c) => getCard(c.defId).category === category) : -1;
      if (idx >= 0 && t.hand.length < state.settings.handMax) {
        const [card] = t.deck.splice(idx, 1);
        t.hand.push(card!);
        ctx.sink.team(
          team,
          { type: 'CARD_DRAWN', team, reason: 'effect', card: { id: card!.id, defId: card!.defId }, deckCount: t.deck.length, handCount: t.hand.length },
          { type: 'CARD_DRAWN', team, reason: 'effect', deckCount: t.deck.length, handCount: t.hand.length },
        );
      }
      t.deck = ctx.rng.shuffle(t.deck);
      pub('draw', { delta: idx >= 0 ? 1 : 0 });
      return true;
    }
    case 'RANDOM_EVENT': {
      const roll = ctx.rng.int(4);
      if (roll === 0) {
        const hidden = unrevealedTiles(state.tiles);
        if (hidden.length >= 2) {
          const [a, b] = ctx.rng.shuffle(hidden).slice(0, 2) as [typeof hidden[number], typeof hidden[number]];
          const pa = a.position;
          a.position = b.position;
          b.position = pa;
          pub('swap', { tiles: [a.id, b.id] });
        } else pub('none');
      } else if (roll === 1) {
        const hidden = unrevealedTiles(state.tiles);
        if (hidden.length > 0) {
          const t = ctx.rng.pick(hidden);
          const e = addEffect(ctx, {
            sourceCardDefId: fx.def.id,
            ownerTeam: team,
            kind: 'lock',
            tileId: t.id,
            forTeam: 'both',
            expiresAtTurn: turn.index + 1,
            visibility: 'public',
          });
          pub('effect', { effectId: e.id, tiles: [t.id] });
        } else pub('none');
      } else if (roll === 2) {
        return runOne(ctx, fx, { op: 'REVEAL_TILE', selector: 'random_neutral' });
      } else {
        for (const side of [team, opp]) {
          const t = state.teams[side];
          if (t.hand.length > 0) {
            const [card] = t.hand.splice(ctx.rng.int(t.hand.length), 1);
            t.discard.push(card!);
          }
        }
        pub('effect');
      }
      return true;
    }
  }
};

export const rowIdsForTarget = rowTiles;
