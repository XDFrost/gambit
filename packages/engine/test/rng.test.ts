import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { Rng, seedToState } from '../src/rng';
import { generateKey } from '../src/board/key';

describe('Rng', () => {
  it('is deterministic for a seed', () => {
    const a = Rng.fromSeed('hello');
    const b = Rng.fromSeed('hello');
    const xs = Array.from({ length: 50 }, () => a.nextU32());
    const ys = Array.from({ length: 50 }, () => b.nextU32());
    expect(xs).toEqual(ys);
  });

  it('different seeds diverge', () => {
    expect(Rng.fromSeed('a').nextU32()).not.toBe(Rng.fromSeed('b').nextU32());
  });

  it('state round-trips so a game can resume mid-stream', () => {
    const a = Rng.fromSeed('resume');
    a.nextU32();
    a.nextU32();
    const snapshot = a.state;
    const b = new Rng(snapshot);
    expect(b.nextU32()).toBe(a.nextU32());
  });

  it('seedToState never yields a zero lane', () => {
    fc.assert(fc.property(fc.string(), (s) => seedToState(s).every((lane) => lane !== 0)));
  });

  it('shuffle is a permutation', () => {
    fc.assert(
      fc.property(fc.array(fc.integer(), { maxLength: 40 }), fc.string(), (arr, seed) => {
        const out = Rng.fromSeed(seed).shuffle(arr);
        expect([...out].sort((x, y) => x - y)).toEqual([...arr].sort((x, y) => x - y));
      }),
    );
  });

  it('int(n) stays in range and covers all values', () => {
    const rng = Rng.fromSeed('range');
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = rng.int(5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(5);
      seen.add(v);
    }
    expect(seen.size).toBe(5);
  });
});

describe('generateKey', () => {
  it('has 9/8/7/1 with the starting team holding 9', () => {
    for (let i = 0; i < 20; i++) {
      const key = generateKey(Rng.fromSeed(`k${i}`));
      const count = (o: string) => key.owners.filter((x) => x === o).length;
      expect(key.owners).toHaveLength(25);
      expect(count(key.startingTeam)).toBe(9);
      expect(count(key.startingTeam === 'ember' ? 'tide' : 'ember')).toBe(8);
      expect(count('neutral')).toBe(7);
      expect(count('assassin')).toBe(1);
    }
  });

  it('picks either team to start over many seeds', () => {
    const starts = new Set(Array.from({ length: 40 }, (_, i) => generateKey(Rng.fromSeed(`s${i}`)).startingTeam));
    expect(starts.size).toBe(2);
  });
});
