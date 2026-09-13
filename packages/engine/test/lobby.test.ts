import { describe, expect, it } from 'vitest';
import { apply, createLobby } from '../src';
import { IDS, expectErr, run, setupLobby } from './helpers';

describe('lobby', () => {
  it('first joiner becomes host; nicknames are unique per room', () => {
    let s = createLobby('ABCDEF', 'x', 0);
    s = run(s, { type: 'JOIN_GAME', nickname: 'Ann' }, null).state;
    expect(s.hostId).toBe('p1');
    expectErr(s, { type: 'JOIN_GAME', nickname: 'ann' }, null, 'NAME_TAKEN');
  });

  it('caps the room at 102 players (50 operatives per team plus two spymasters)', () => {
    let s = createLobby('ABCDEF', 'x', 0);
    for (let i = 0; i < 102; i++) s = run(s, { type: 'JOIN_GAME', nickname: `P${i}` }, null).state;
    expectErr(s, { type: 'JOIN_GAME', nickname: 'Late' }, null, 'ROOM_FULL');
  });

  it('a team may have many operatives but exactly one spymaster', () => {
    let s = setupLobby();
    for (let i = 0; i < 6; i++) {
      s = run(s, { type: 'JOIN_GAME', nickname: `Extra${i}` }, null).state;
      s = run(s, { type: 'SET_TEAM', team: 'ember' }, `p${5 + i}`).state;
    }
    expectErr(s, { type: 'SET_ROLE', role: 'spymaster' }, 'p5', 'SPYMASTER_TAKEN');
    const started = run(s, { type: 'START_GAME' }, IDS.emberSpy).state;
    expect(started.status).toBe('in_game');
    expect(Object.values(started.players).filter((p) => p.team === 'ember' && p.role === 'operative')).toHaveLength(7);
  });

  it('only one spymaster per team', () => {
    const s = setupLobby();
    expectErr(s, { type: 'SET_ROLE', role: 'spymaster' }, IDS.emberOp, 'SPYMASTER_TAKEN');
  });

  it('start requires the host and a valid composition', () => {
    const s = setupLobby();
    expectErr(s, { type: 'START_GAME' }, IDS.emberOp, 'NOT_HOST');
    const broken = run(s, { type: 'SET_TEAM', team: null }, IDS.tideOp).state;
    expectErr(broken, { type: 'START_GAME' }, IDS.emberSpy, 'INVALID_COMPOSITION');
  });

  it('starting deals boards, keys, decks and opening hands, and marks spymasters key-tainted', () => {
    const s = run(setupLobby(), { type: 'START_GAME' }, IDS.emberSpy).state;
    expect(s.status).toBe('in_game');
    expect(s.tiles).toHaveLength(25);
    expect(new Set(s.tiles.map((t) => t.word)).size).toBe(25);
    expect(s.key?.owners).toHaveLength(25);
    for (const team of ['ember', 'tide'] as const) {
      const t = s.teams[team];
      expect(t.wordsTotal).toBe(s.key!.owners.filter((o) => o === team).length);
      expect(t.hand.length + t.deck.length).toBe(24);
      expect(t.hand.length).toBeGreaterThanOrEqual(2);
    }
    expect(s.players[IDS.emberSpy]!.keyTainted).toBe(true);
    expect(s.players[IDS.emberOp]!.keyTainted).toBe(false);
    expect(s.turn?.team).toBe(s.key?.startingTeam);
    expect(s.turn?.phase).toBe('clue');
  });

  it('leaving in the lobby removes the player and hands off host', () => {
    let s = setupLobby();
    s = run(s, { type: 'LEAVE' }, IDS.emberSpy).state;
    expect(s.players[IDS.emberSpy]).toBeUndefined();
    expect(s.hostId).toBe(IDS.emberOp);
  });

  it('unknown actors are rejected', () => {
    const s = setupLobby();
    const r = apply(s, { type: 'TOGGLE_READY' }, { actorId: 'nobody', now: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NOT_AUTHED');
  });
});
