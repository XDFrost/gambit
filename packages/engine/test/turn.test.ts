import { describe, expect, it } from 'vitest';
import { otherTeam } from '@gambit/protocol';
import { apply } from '../src';
import { IDS, eventsOfType, expectErr, firstOwned, giveClue, guess, opOf, run, setupGame, spyOf, tilesOwned } from './helpers';

describe('clue phase', () => {
  it('only the active spymaster can clue, and only in the clue phase', () => {
    const s = setupGame();
    const team = s.turn!.team;
    expectErr(s, { type: 'GIVE_CLUE', word: 'XYZZY', count: 1, expectedTurnIndex: 0 }, opOf(team), 'WRONG_ROLE');
    expectErr(s, { type: 'GIVE_CLUE', word: 'XYZZY', count: 1, expectedTurnIndex: 0 }, spyOf(otherTeam(team)), 'NOT_YOUR_TURN');
    const after = giveClue(s, 1, 'XYZZY');
    expectErr(after, { type: 'GIVE_CLUE', word: 'AGAIN', count: 1, expectedTurnIndex: 0 }, spyOf(team), 'WRONG_PHASE');
  });

  it('rejects clues that match or contain a board word, multi-word clues, and stale turn indexes', () => {
    const s = setupGame();
    const team = s.turn!.team;
    const boardWord = s.tiles[0]!.word;
    expectErr(s, { type: 'GIVE_CLUE', word: boardWord, count: 1, expectedTurnIndex: 0 }, spyOf(team), 'INVALID_CLUE');
    expectErr(s, { type: 'GIVE_CLUE', word: `${boardWord}S`, count: 1, expectedTurnIndex: 0 }, spyOf(team), 'INVALID_CLUE');
    expectErr(s, { type: 'GIVE_CLUE', word: 'TWO WORDS', count: 1, expectedTurnIndex: 0 }, spyOf(team), 'INVALID_CLUE');
    expectErr(s, { type: 'GIVE_CLUE', word: 'FINE', count: 1, expectedTurnIndex: 3 }, spyOf(team), 'STALE_STATE');
  });

  it('count+1 guesses; zero means unlimited', () => {
    const s = setupGame();
    expect(giveClue(s, 3).turn!.guessesRemaining).toBe(4);
    expect(giveClue(s, 0).turn!.guessesRemaining).toBe('unlimited');
  });
});

describe('guessing', () => {
  it('own word continues; guesses exhaust ends the turn', () => {
    let s = giveClue(setupGame(), 1); // 2 guesses
    const team = s.turn!.team;
    const [a, b] = tilesOwned(s, team);
    let r = guess(s, a!);
    s = r.state;
    expect(s.turn!.team).toBe(team);
    expect(s.turn!.guessesRemaining).toBe(1);
    expect(eventsOfType(r.events, 'WORD_REVEALED')[0]!.event.outcome).toBe('continue');
    r = guess(s, b!);
    s = r.state;
    expect(eventsOfType(r.events, 'TURN_ENDED')[0]!.event.reason).toBe('exhausted');
    expect(s.turn!.team).toBe(otherTeam(team));
    expect(s.turn!.index).toBe(1);
    expect(s.teams[team].wordsRemaining).toBe(s.teams[team].wordsTotal - 2);
  });

  it('neutral ends the turn; opponent word ends the turn and counts for them', () => {
    const s = giveClue(setupGame(), 3);
    const team = s.turn!.team;
    const opp = otherTeam(team);
    const n = guess(s, firstOwned(s, 'neutral'));
    expect(eventsOfType(n.events, 'TURN_ENDED')[0]!.event.reason).toBe('wrong_guess');
    expect(n.state.turn!.team).toBe(opp);
    const o = guess(s, firstOwned(s, opp));
    expect(o.state.teams[opp].wordsRemaining).toBe(o.state.teams[opp].wordsTotal - 1);
    expect(o.state.turn!.team).toBe(opp);
  });

  it('the assassin loses the game immediately for the guessing team', () => {
    const s = giveClue(setupGame(), 3);
    const team = s.turn!.team;
    const r = guess(s, firstOwned(s, 'assassin'));
    expect(r.state.status).toBe('game_over');
    expect(r.state.result).toEqual({ winner: otherTeam(team), reason: 'assassin' });
    const over = eventsOfType(r.events, 'GAME_OVER')[0]!.event;
    expect(over.result.key).toHaveLength(25);
  });

  it('revealing the last own word wins', () => {
    let s = giveClue(setupGame(), 0); // unlimited
    const team = s.turn!.team;
    const own = tilesOwned(s, team);
    for (const id of own) {
      const r = guess(s, id);
      s = r.state;
    }
    expect(s.status).toBe('game_over');
    expect(s.result?.winner).toBe(team);
  });

  it('rejects wrong actor, wrong phase, revealed tiles, stale index, and spymasters', () => {
    const s0 = setupGame();
    const team = s0.turn!.team;
    expectErr(s0, { type: 'SELECT_WORD', tileId: 0, expectedTurnIndex: 0 }, opOf(team), 'WRONG_PHASE');
    const s = giveClue(s0, 2);
    expectErr(s, { type: 'SELECT_WORD', tileId: 0, expectedTurnIndex: 0 }, opOf(otherTeam(team)), 'NOT_YOUR_TURN');
    expectErr(s, { type: 'SELECT_WORD', tileId: 0, expectedTurnIndex: 0 }, spyOf(team), 'WRONG_ROLE');
    expectErr(s, { type: 'SELECT_WORD', tileId: 0, expectedTurnIndex: 1 }, opOf(team), 'STALE_STATE');
    const own = firstOwned(s, team);
    const after = guess(s, own).state;
    expectErr(after, { type: 'SELECT_WORD', tileId: own, expectedTurnIndex: 0 }, opOf(team), 'TILE_REVEALED');
  });

  it('END_TURN hands over voluntarily', () => {
    const s = giveClue(setupGame(), 2);
    const team = s.turn!.team;
    const r = run(s, { type: 'END_TURN', expectedTurnIndex: 0 }, opOf(team));
    expect(eventsOfType(r.events, 'TURN_ENDED')[0]!.event.reason).toBe('voluntary');
    expect(r.state.turn!.team).toBe(otherTeam(team));
  });

  it('spymaster promotion: blocked while present, allowed when away, old spymaster is key-tainted', () => {
    let s = setupGame();
    const team = s.turn!.team;
    expectErr(s, { type: 'PROMOTE_SPYMASTER', playerId: opOf(team) }, opOf(team), 'SPYMASTER_PRESENT');
    const r0 = run(s, { type: 'INTERNAL_SEAT', playerId: spyOf(team), status: 'away' }, null);
    s = r0.state;
    expect(eventsOfType(r0.events, 'SPYMASTER_VACANT')[0]!.scope).toEqual({ kind: 'team', team });
    s = run(s, { type: 'PROMOTE_SPYMASTER', playerId: opOf(team) }, opOf(team)).state;
    expect(s.players[opOf(team)]!.role).toBe('spymaster');
    expect(s.players[spyOf(team)]!.role).toBe('operative');
    expect(s.players[spyOf(team)]!.keyTainted).toBe(true);
    // The new spymaster clues; the old one, now an operative, may not guess.
    s = run(s, { type: 'INTERNAL_SEAT', playerId: spyOf(team), status: 'connected' }, null).state;
    s = run(s, { type: 'GIVE_CLUE', word: 'XYZZY', count: 2, expectedTurnIndex: 0 }, opOf(team)).state;
    expectErr(s, { type: 'SELECT_WORD', tileId: 0, expectedTurnIndex: 0 }, spyOf(team), 'KEY_TAINTED');
    expectErr(s, { type: 'PROMOTE_SPYMASTER', playerId: spyOf(team) }, spyOf(team), 'SPYMASTER_PRESENT');
  });
});

describe('determinism', () => {
  it('same seed and script produce identical state and events', () => {
    const script = () => {
      let s = giveClue(setupGame('det'), 2);
      const events = [];
      const r = guess(s, firstOwned(s, s.turn!.team));
      s = r.state;
      events.push(...r.events);
      return { s, events };
    };
    const a = script();
    const b = script();
    expect(a.s).toEqual(b.s);
    expect(a.events).toEqual(b.events);
  });

  it('different seeds produce different keys', () => {
    expect(setupGame('one').key!.owners).not.toEqual(setupGame('two').key!.owners);
  });

  it('a failed command leaves the input untouched', () => {
    const s = setupGame();
    const before = structuredClone(s);
    apply(s, { type: 'SELECT_WORD', tileId: 0, expectedTurnIndex: 0 }, { actorId: IDS.emberOp, now: 5 });
    expect(s).toEqual(before);
  });
});
