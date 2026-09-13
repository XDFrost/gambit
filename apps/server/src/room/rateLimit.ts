import type { CommandType } from '@gambit/protocol';

/** Token bucket plus per-command minimum intervals. One instance per connection. */
export class RateLimiter {
  private tokens: number;
  private last: number;
  private violations: number[] = [];
  private lastByType = new Map<CommandType, number>();

  constructor(
    private readonly ratePerSec = 10,
    private readonly burst = 20,
  ) {
    this.tokens = burst;
    this.last = 0;
  }

  private static readonly MIN_INTERVAL_MS: Partial<Record<CommandType, number>> = {
    SELECT_WORD: 300,
    MARK_WORD: 150,
    RESYNC: 2000,
  };

  /** Returns 'ok', 'limited', or 'abusive' (caller should close the socket). */
  check(type: CommandType, now: number): 'ok' | 'limited' | 'abusive' {
    if (this.last === 0) this.last = now;
    const elapsed = Math.max(0, now - this.last) / 1000;
    this.tokens = Math.min(this.burst, this.tokens + elapsed * this.ratePerSec);
    this.last = now;
    const min = RateLimiter.MIN_INTERVAL_MS[type];
    const prev = this.lastByType.get(type);
    let limited = false;
    if (min !== undefined && prev !== undefined && now - prev < min) limited = true;
    if (this.tokens < 1) limited = true;
    if (limited) {
      this.violations = this.violations.filter((t) => now - t < 10_000);
      this.violations.push(now);
      return this.violations.length >= 3 ? 'abusive' : 'limited';
    }
    this.tokens -= 1;
    this.lastByType.set(type, now);
    return 'ok';
  }
}
