import { describe, expect, it } from 'vitest';
import { otherTeam } from '@gambit/protocol';
import { projectFor } from '../src';
import { eventsOfType, expectErr, firstOwned, giveClue, guess, opOf, run, setupGame, spyOf } from './helpers';

describe('word marks (two-step selection)', () => {
  it('toggles the marker on and off and is visible to everyone', () => {
    let s = giveClue(setupGame(), 2);
    const team = s.turn!.team;
    const tile = firstOwned(s, team);
    let r = run(s, { type: 'MARK_WORD', tileId: tile, expectedTurnIndex: 0 }, opOf(team));
    s = r.state;
    expect(s.turn!.marks[tile]).toEqual([opOf(team)]);
    const ev = eventsOfType(r.events, 'WORD_MARKED')[0]!;
    expect(ev.scope).toEqual({ kind: 'public' });
    expect(ev.event.marked).toBe(true);
    // Spectating spymaster and opponents see the mark too.
    expect(projectFor(s, spyOf(otherTeam(team))).public.turn!.marks[String(tile)]).toEqual([opOf(team)]);
    // Nothing was revealed and no guess was spent.
    expect(s.tiles[tile]!.revealed).toBe(false);
    expect(s.turn!.guessesRemaining).toBe(3);

    r = run(s, { type: 'MARK_WORD', tileId: tile, expectedTurnIndex: 0 }, opOf(team));
    expect(r.state.turn!.marks[tile]).toBeUndefined();
    expect(eventsOfType(r.events, 'WORD_MARKED')[0]!.event.marked).toBe(false);
  });

  it('only active operatives in the guess phase may mark', () => {
    const s0 = setupGame();
    const team = s0.turn!.team;
    expectErr(s0, { type: 'MARK_WORD', tileId: 0, expectedTurnIndex: 0 }, opOf(team), 'WRONG_PHASE');
    const s = giveClue(s0, 2);
    expectErr(s, { type: 'MARK_WORD', tileId: 0, expectedTurnIndex: 0 }, spyOf(team), 'WRONG_ROLE');
    expectErr(s, { type: 'MARK_WORD', tileId: 0, expectedTurnIndex: 0 }, opOf(otherTeam(team)), 'NOT_YOUR_TURN');
    expectErr(s, { type: 'MARK_WORD', tileId: 0, expectedTurnIndex: 3 }, opOf(team), 'STALE_STATE');
  });

  it('marks clear when the word is revealed and when the turn ends', () => {
    let s = giveClue(setupGame(), 2);
    const team = s.turn!.team;
    const own = firstOwned(s, team);
    const other = firstOwned(s, 'neutral');
    s = run(s, { type: 'MARK_WORD', tileId: own, expectedTurnIndex: 0 }, opOf(team)).state;
    s = run(s, { type: 'MARK_WORD', tileId: other, expectedTurnIndex: 0 }, opOf(team)).state;
    s = guess(s, own).state;
    expect(s.turn!.marks[own]).toBeUndefined();
    expect(s.turn!.marks[other]).toEqual([opOf(team)]);
    s = run(s, { type: 'END_TURN', expectedTurnIndex: 0 }, opOf(team)).state;
    expect(s.turn!.marks).toEqual({});
  });
});
