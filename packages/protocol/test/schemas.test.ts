import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  ClientEnvelopeSchema,
  ClientViewSchema,
  CommandSchema,
  NicknameSchema,
  PublicViewSchema,
  RoomCodeSchema,
  ServerEnvelopeSchema,
  TeamViewSchema,
} from '../src';

describe('commands', () => {
  it('parses a valid SELECT_WORD envelope', () => {
    const r = ClientEnvelopeSchema.safeParse({
      v: 1,
      commandId: 'abcdefgh1234',
      command: { type: 'SELECT_WORD', tileId: 3, expectedTurnIndex: 0 },
    });
    expect(r.success).toBe(true);
  });

  it('rejects unknown fields (strict) and out-of-range tiles', () => {
    expect(CommandSchema.safeParse({ type: 'SELECT_WORD', tileId: 25, expectedTurnIndex: 0 }).success).toBe(false);
    expect(CommandSchema.safeParse({ type: 'END_TURN', expectedTurnIndex: 0, extra: 1 }).success).toBe(false);
  });

  it('never throws on arbitrary JSON', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const r = ClientEnvelopeSchema.safeParse(value);
        expect(typeof r.success).toBe('boolean');
      }),
    );
  });
});

describe('identifiers', () => {
  it('room codes exclude ambiguous glyphs', () => {
    expect(RoomCodeSchema.safeParse('ABC234').success).toBe(true);
    expect(RoomCodeSchema.safeParse('ABC01O').success).toBe(false);
    expect(RoomCodeSchema.safeParse('abc234').success).toBe(false);
  });

  it('nicknames are trimmed and bounded', () => {
    expect(NicknameSchema.parse('  Priya ')).toBe('Priya');
    expect(NicknameSchema.safeParse('A').success).toBe(false);
    expect(NicknameSchema.safeParse('x'.repeat(17)).success).toBe(false);
  });
});

/**
 * Schema audit: the shapes that reach operatives must not have any path that could carry the
 * hidden key. `owner` is allowed only on tiles (present only when revealed), in `result.key`
 * (game over), and in `team.knownOwners` (paid-for information).
 */
describe('view schema audit', () => {
  const walk = (schema: unknown, path: string[], out: string[]): void => {
    const def = (schema as { def?: Record<string, unknown>; _def?: Record<string, unknown> }).def ??
      (schema as { _def?: Record<string, unknown> })._def;
    if (!def) return;
    const type = def.type ?? def.typeName;
    if (type === 'object' || type === 'ZodObject') {
      const shape = typeof def.shape === 'function' ? (def.shape as () => Record<string, unknown>)() : (def.shape as Record<string, unknown>);
      for (const [k, v] of Object.entries(shape)) {
        out.push([...path, k].join('.'));
        walk(v, [...path, k], out);
      }
      return;
    }
    for (const key of ['innerType', 'element', 'valueType', 'in', 'out']) {
      if (def[key]) walk(def[key], path, out);
    }
    if (Array.isArray(def.options)) for (const o of def.options) walk(o, path, out);
  };

  it('PublicView has no key/deck/hand paths', () => {
    const paths: string[] = [];
    walk(PublicViewSchema, [], paths);
    const forbidden = paths.filter((p) => /(^|\.)(key|deck|hand|order|owners)$/.test(p) && p !== 'result.key');
    expect(forbidden).toEqual([]);
  });

  it('TeamView exposes hand but never a key', () => {
    const paths: string[] = [];
    walk(TeamViewSchema, [], paths);
    expect(paths.some((p) => p.endsWith('.key') || p === 'key')).toBe(false);
    expect(paths).toContain('hand');
  });

  it('ClientView is strict at every level', () => {
    const r = ClientViewSchema.safeParse({ public: {}, me: {}, team: null, spymaster: null, extra: 1 });
    expect(r.success).toBe(false);
  });

  it('ServerEnvelope rejects unknown event types', () => {
    const r = ServerEnvelopeSchema.safeParse({ v: 1, seq: 1, ts: 0, event: { type: 'LEAK_KEY' } });
    expect(r.success).toBe(false);
  });
});
