/**
 * Deterministic RNG (xorshift128, 32-bit lanes) seeded from a string.
 * The state is stored in GameState so a game can be replayed exactly from its event log.
 */
export type RngState = [number, number, number, number];

const fmix = (h: number): number => {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
};

/** Hash a seed string into four non-zero 32-bit lanes. */
export const seedToState = (seed: string): RngState => {
  let h = 0x9e3779b9;
  for (let i = 0; i < seed.length; i++) h = fmix(h ^ Math.imul(seed.charCodeAt(i), 0x27d4eb2d) ^ i);
  const lanes: number[] = [];
  for (let i = 0; i < 4; i++) {
    h = fmix(h + 0x6a09e667 * (i + 1));
    lanes.push(h === 0 ? 0x1 : h);
  }
  return lanes as RngState;
};

export class Rng {
  private s: RngState;

  constructor(state: RngState) {
    this.s = [state[0] >>> 0, state[1] >>> 0, state[2] >>> 0, state[3] >>> 0];
  }

  static fromSeed(seed: string): Rng {
    return new Rng(seedToState(seed));
  }

  get state(): RngState {
    return [...this.s] as RngState;
  }

  nextU32(): number {
    let [x, y, z, w] = this.s;
    const t = (x ^ (x << 11)) >>> 0;
    x = y;
    y = z;
    z = w;
    w = (w ^ (w >>> 19) ^ (t ^ (t >>> 8))) >>> 0;
    this.s = [x, y, z, w];
    return w;
  }

  /** Uniform float in [0, 1). */
  float(): number {
    return this.nextU32() / 0x1_0000_0000;
  }

  /** Uniform integer in [0, n). */
  int(n: number): number {
    if (n <= 0) throw new RangeError('int(n) requires n > 0');
    return Math.floor(this.float() * n);
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new RangeError('pick from empty array');
    return arr[this.int(arr.length)] as T;
  }

  /** Fisher-Yates; returns a new array. */
  shuffle<T>(arr: readonly T[]): T[] {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const a = out[i] as T;
      out[i] = out[j] as T;
      out[j] = a;
    }
    return out;
  }
}
