import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Owner, TileId } from '@gambit/protocol';
import { ClientViewSchema } from '@gambit/protocol';
import { apply, projectFor, type GameState } from '../src';
import { IDS, giveClue, opOf, setupGame } from './helpers';

/**
 * Key-independence: permuting the hidden key among tiles that are unrevealed and not known to a
 * player's team must not change that player's projection. If any bit of the key leaked, the
 * projections would differ.
 */
const permuteHiddenKey = (state: GameState, forPlayer: string, swaps: Array<[number, number]>): GameState => {
  const s = structuredClone(state);
  const me = s.players[forPlayer]!;
  const known = me.team ? s.teams[me.team].knownOwners : {};
  const candidates = s.tiles.filter((t) => !t.revealed && known[t.id as TileId] === undefined).map((t) => t.id);
  if (candidates.length < 2) return s;
  for (const [a, b] of swaps) {
    const i = candidates[a % candidates.length]!;
    const j = candidates[b % candidates.length]!;
    const tmp = s.key!.owners[i]!;
    s.key!.owners[i] = s.key!.owners[j]!;
    s.key!.owners[j] = tmp;
  }
  return s;
};

/** Advance a game a few random steps so states are varied. */
const advance = (seed: string, steps: number[]): GameState => {
  let s = setupGame(seed);
  for (const step of steps) {
    if (s.status !== 'in_game' || !s.turn) break;
    if (s.turn.phase === 'clue') {
      s = giveClue(s, step % 4);
      continue;
    }
    const hidden = s.tiles.filter((t) => !t.revealed);
    const tile = hidden[step % hidden.length]!;
    const r = apply(s, { type: 'SELECT_WORD', tileId: tile.id, expectedTurnIndex: s.turn.index }, { actorId: opOf(s.turn.team), now: 0 });
    if (r.ok) s = r.state;
  }
  return s;
};

describe('projection leak tests', () => {
  it('operative and spectator views are independent of the hidden key', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 6 }),
        fc.array(fc.nat(30), { maxLength: 6 }),
        fc.array(fc.tuple(fc.nat(24), fc.nat(24)), { minLength: 1, maxLength: 5 }),
        (seed, steps, swaps) => {
          const s = advance(seed, steps);
          if (s.status === 'game_over') return; // the key is public once the game ends
          for (const pid of [IDS.emberOp, IDS.tideOp]) {
            const a = projectFor(s, pid);
            const b = projectFor(permuteHiddenKey(s, pid, swaps), pid);
            expect(b).toEqual(a);
          }
        },
      ),
      { numRuns: 60 },
    );
  });

  it('a team’s view is independent of the opposing hand and of both deck orders', () => {
    const s = giveClue(setupGame('hands'), 2);
    const before = projectFor(s, IDS.emberOp);
    const mutated = structuredClone(s);
    mutated.teams.tide.hand.reverse();
    mutated.teams.tide.hand.forEach((c) => (c.defId = 'overtime'));
    mutated.teams.ember.deck.reverse();
    mutated.teams.tide.deck.reverse();
    expect(projectFor(mutated, IDS.emberOp)).toEqual(before);
  });

  it('spymasters receive the key but never a hand; operatives receive a hand but never the key', () => {
    const s = giveClue(setupGame('roles'), 2);
    const spy = projectFor(s, IDS.emberSpy);
    expect(spy.spymaster?.key).toHaveLength(25);
    expect(spy.team).toBeNull();
    const op = projectFor(s, IDS.emberOp);
    expect(op.spymaster).toBeNull();
    expect(op.team?.hand.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(op);
    expect(serialized).not.toContain('"assassin"');
    for (const t of op.public.tiles) if (!t.revealed) expect(t.owner).toBeUndefined();
  });

  it('every projection validates against the strict ClientView schema', () => {
    const s = giveClue(setupGame('schema'), 2);
    for (const pid of Object.keys(s.players)) {
      const r = ClientViewSchema.safeParse(projectFor(s, pid));
      expect(r.success, pid).toBe(true);
    }
  });

  it('the full key appears for everyone only after the game ends', () => {
    let s = giveClue(setupGame('over'), 3);
    const assassin = s.tiles.find((t) => s.key!.owners[t.id] === 'assassin')!;
    const r = apply(s, { type: 'SELECT_WORD', tileId: assassin.id, expectedTurnIndex: 0 }, { actorId: opOf(s.turn!.team), now: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    const op = projectFor(s, IDS.tideOp);
    expect(op.public.result?.key.filter((o: Owner) => o === 'assassin')).toHaveLength(1);
  });
});
