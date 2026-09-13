import { describe, expect, it } from 'vitest';
import { otherTeam } from '@gambit/protocol';
import { CardDefinitionViewSchema } from '@gambit/protocol';
import { ALL_CARDS, apply, toView, poolDefinitions } from '../src';
import { isLockedFor } from '../src/cards/effects';
import {
  eventsOfType,
  expectErr,
  firstOwned,
  giveCard,
  giveClue,
  guess,
  opOf,
  play,
  run,
  setupGame,
  spyOf,
  tilesOwned,
} from './helpers';

describe('card definitions', () => {
  it('every definition is unique, valid as a client view, and uses known primitives', () => {
    const ids = new Set(ALL_CARDS.map((c) => c.id));
    expect(ids.size).toBe(ALL_CARDS.length);
    for (const def of ALL_CARDS) {
      expect(CardDefinitionViewSchema.safeParse(toView(def)).success, def.id).toBe(true);
      expect(def.effects.length, def.id).toBeGreaterThan(0);
      expect(def.description.split(/\s+/).length, `${def.id} description too long`).toBeLessThanOrEqual(20);
    }
  });

  it('the MVP pool has twelve cards and the full pool has them all', () => {
    expect(poolDefinitions('mvp')).toHaveLength(12);
    expect(poolDefinitions('full')).toHaveLength(ALL_CARDS.length);
    expect(poolDefinitions('none')).toHaveLength(0);
  });
});

describe('deck and draws', () => {
  it('builds a 24-card deck per team from the pool and deals an opening hand of 2', () => {
    const s = setupGame();
    const active = s.turn!.team;
    for (const team of ['ember', 'tide'] as const) {
      const t = s.teams[team];
      const drawn = team === active ? 3 : 2; // opening 2 + auto-draw for the active team
      expect(t.hand).toHaveLength(drawn);
      expect(t.deck).toHaveLength(24 - drawn);
      expect(t.hand.every((c) => poolDefinitions('mvp').some((d) => d.id === c.defId))).toBe(true);
    }
  });

  it('auto-draws one card at turn start and skips when the hand is full', () => {
    let s = giveClue(setupGame(), 2);
    const team = s.turn!.team;
    const opp = otherTeam(team);
    const handBefore = s.teams[opp].hand.length;
    let r = run(s, { type: 'END_TURN', expectedTurnIndex: 0 }, opOf(team));
    s = r.state;
    expect(s.teams[opp].hand).toHaveLength(handBefore + 1);
    const drawn = eventsOfType(r.events, 'CARD_DRAWN');
    expect(drawn[0]!.scope).toEqual({ kind: 'team', team: opp });
    expect(drawn[0]!.event.card).toBeDefined();
    expect(drawn[0]!.publicVariant).toBeDefined();
    expect((drawn[0]!.publicVariant as { card?: unknown }).card).toBeUndefined();

    // Fill the hand to max, pass twice, and check no draw happens.
    s.teams[team].hand = Array.from({ length: 4 }, (_, i) => ({ id: `full${i}`, defId: 'overtime', drawnAtTurn: 0 }));
    s = giveClue(s, 1);
    r = run(s, { type: 'END_TURN', expectedTurnIndex: 1 }, opOf(opp));
    expect(r.state.teams[team].hand).toHaveLength(4);
    expect(eventsOfType(r.events, 'CARD_DRAWN')).toHaveLength(0);
  });

  it('classic mode has no cards at all', () => {
    const s = setupGame('classic', { cardPool: 'none' });
    expect(s.teams.ember.deck).toHaveLength(0);
    expect(s.teams.ember.hand).toHaveLength(0);
  });
});

describe('playing cards: guards', () => {
  it('only active operatives in the guess phase, one per turn, from their own hand', () => {
    const base = setupGame();
    const team = base.turn!.team;
    const g = giveCard(base, 'overtime');
    expectErr(g.state, { type: 'PLAY_CARD', cardInstanceId: g.cardId, expectedTurnIndex: 0 }, opOf(team), 'WRONG_PHASE');
    let s = giveClue(g.state, 2);
    expectErr(s, { type: 'PLAY_CARD', cardInstanceId: g.cardId, expectedTurnIndex: 0 }, spyOf(team), 'WRONG_ROLE');
    expectErr(s, { type: 'PLAY_CARD', cardInstanceId: g.cardId, expectedTurnIndex: 0 }, opOf(otherTeam(team)), 'NOT_YOUR_TURN');
    expectErr(s, { type: 'PLAY_CARD', cardInstanceId: 'nope', expectedTurnIndex: 0 }, opOf(team), 'CARD_NOT_IN_HAND');
    s = play(s, g.cardId).state;
    const g2 = giveCard(s, 'overtime');
    expectErr(g2.state, { type: 'PLAY_CARD', cardInstanceId: g2.cardId, expectedTurnIndex: 0 }, opOf(team), 'ALREADY_PLAYED');
  });
});

describe('MVP cards', () => {
  it('Overtime adds a guess; extras cap at +2 per turn', () => {
    let s = giveClue(setupGame(), 1); // 2 guesses
    const a = giveCard(s, 'overtime');
    s = play(a.state, a.cardId).state;
    expect(s.turn!.guessesRemaining).toBe(3);
    // Simulate a second turn's worth of extras by resetting playedThisTurn (test-only).
    s.teams[s.turn!.team].playedThisTurn = false;
    const b = giveCard(s, 'loudspeaker');
    s = play(b.state, b.cardId).state;
    expect(s.turn!.guessesRemaining).toBe(4); // only +1 more: cap reached
    expect(s.turn!.extraGuessesGranted).toBe(2);
  });

  it('Overtime is not playable on an unlimited clue', () => {
    const s = giveClue(setupGame(), 0);
    const g = giveCard(s, 'overtime');
    expectErr(g.state, { type: 'PLAY_CARD', cardInstanceId: g.cardId, expectedTurnIndex: 0 }, opOf(s.turn!.team), 'CONDITION_FAILED');
  });

  it('Litmus costs a guess, answers privately, and records a known owner on YES', () => {
    let s = giveClue(setupGame(), 2); // 3 guesses
    const team = s.turn!.team;
    const own = firstOwned(s, team);
    const g = giveCard(s, 'litmus');
    const r = play(g.state, g.cardId, { tiles: [own] });
    s = r.state;
    expect(s.turn!.guessesRemaining).toBe(2);
    const info = eventsOfType(r.events, 'INFO_REVEALED');
    expect(info).toHaveLength(1);
    expect(info[0]!.scope).toEqual({ kind: 'team', team });
    expect(info[0]!.event.result).toBe('yes');
    expect(s.teams[team].knownOwners[own]).toBe(team);
    const pub = eventsOfType(r.events, 'EFFECT_APPLIED').find((e) => e.event.kind === 'info');
    expect(pub?.event.tiles).toEqual([own]);
    expect(s.teams[team].discard.map((c) => c.defId)).toContain('litmus');
  });

  it('Litmus needs two guesses remaining', () => {
    const s = giveClue(setupGame(), 0);
    const one = { ...s, turn: { ...s.turn!, guessesAllowed: 1, guessesRemaining: 1 } };
    const g = giveCard(one, 'litmus');
    expectErr(g.state, { type: 'PLAY_CARD', cardInstanceId: g.cardId, target: { tiles: [firstOwned(s, s.turn!.team)] }, expectedTurnIndex: 0 }, opOf(s.turn!.team), 'COST_UNPAYABLE');
  });

  it('Triangulate shows three tiles and names one own word', () => {
    const s = giveClue(setupGame(), 2);
    const team = s.turn!.team;
    const g = giveCard(s, 'triangulate');
    const r = play(g.state, g.cardId);
    const info = eventsOfType(r.events, 'INFO_REVEALED')[0]!.event;
    expect(info.tiles).toHaveLength(3);
    const named = Number(info.result);
    expect(info.tiles).toContain(named);
    expect(s.key!.owners[named]).toBe(team);
  });

  it('Sonar buckets neighbour counts as 0, 1 or 2+', () => {
    const s = giveClue(setupGame(), 2);
    const g = giveCard(s, 'sonar');
    const r = play(g.state, g.cardId, { tiles: [12] });
    const info = eventsOfType(r.events, 'INFO_REVEALED')[0]!.event;
    expect(['0', '1', '2+']).toContain(info.result);
    expect(r.state.turn!.guessesRemaining).toBe(3); // free
  });

  it('Quarantine locks a tile for the opponent’s next turn only', () => {
    let s = giveClue(setupGame(), 2);
    const team = s.turn!.team;
    const opp = otherTeam(team);
    const target = firstOwned(s, opp);
    const g = giveCard(s, 'quarantine');
    s = play(g.state, g.cardId, { tiles: [target] }).state;
    s = run(s, { type: 'END_TURN', expectedTurnIndex: 0 }, opOf(team)).state;
    expect(isLockedFor(s, target, opp)).toBe(true);
    s = giveClue(s, 2);
    expectErr(s, { type: 'SELECT_WORD', tileId: target, expectedTurnIndex: 1 }, opOf(opp), 'TILE_LOCKED');
    s = run(s, { type: 'END_TURN', expectedTurnIndex: 1 }, opOf(opp)).state;
    // Back on the locker's turn the lock has expired.
    expect(isLockedFor(s, target, opp)).toBe(false);
    expect(s.activeEffects.some((e) => e.kind === 'lock')).toBe(false);
  });

  it('Ward shields a tile from opponent cards but not from own cards', () => {
    let s = giveClue(setupGame(), 2);
    const team = s.turn!.team;
    const opp = otherTeam(team);
    const tile = firstOwned(s, team);
    const w = giveCard(s, 'ward');
    s = play(w.state, w.cardId, { tiles: [tile] }).state;
    s = run(s, { type: 'END_TURN', expectedTurnIndex: 0 }, opOf(team)).state;
    s = giveClue(s, 2);
    const q = giveCard(s, 'quarantine');
    expectErr(q.state, { type: 'PLAY_CARD', cardInstanceId: q.cardId, target: { tiles: [tile] }, expectedTurnIndex: 1 }, opOf(opp), 'TARGET_INVALID');
    // The shield expires after the owner's next turn ends (index 2 -> gone at index 3).
    s = run(s, { type: 'END_TURN', expectedTurnIndex: 1 }, opOf(opp)).state;
    s = giveClue(s, 2);
    s = run(s, { type: 'END_TURN', expectedTurnIndex: 2 }, opOf(team)).state;
    expect(s.activeEffects.some((e) => e.kind === 'shield')).toBe(false);
  });

  it('Dredge reveals a random neutral for everyone and does not end the turn', () => {
    const s = giveClue(setupGame(), 2);
    const g = giveCard(s, 'dredge');
    const r = play(g.state, g.cardId);
    const rev = eventsOfType(r.events, 'WORD_REVEALED')[0]!.event;
    expect(rev.owner).toBe('neutral');
    expect(rev.outcome).toBe('card');
    expect(r.state.turn!.team).toBe(s.turn!.team);
    expect(r.state.tiles[rev.tileId]!.revealed).toBe(true);
  });

  it('Second Chance forgives one wrong guess but never the assassin', () => {
    let s = giveClue(setupGame(), 3);
    const team = s.turn!.team;
    const g = giveCard(s, 'second_chance');
    s = play(g.state, g.cardId).state;
    let r = guess(s, firstOwned(s, 'neutral'));
    expect(eventsOfType(r.events, 'WORD_REVEALED')[0]!.event.outcome).toBe('forgiven');
    expect(r.state.turn!.team).toBe(team);
    // second wrong guess ends the turn
    r = guess(r.state, firstOwned(r.state, 'neutral'));
    expect(r.state.turn!.team).toBe(otherTeam(team));

    const s2 = play(giveCard(giveClue(setupGame('x'), 3), 'second_chance').state, giveCard(giveClue(setupGame('x'), 3), 'second_chance').cardId).state;
    const dead = guess(s2, firstOwned(s2, 'assassin'));
    expect(dead.state.status).toBe('game_over');
  });

  it('Abstain ends the turn and banks +1 for the team’s next turn', () => {
    let s = giveClue(setupGame(), 2);
    const team = s.turn!.team;
    const opp = otherTeam(team);
    const g = giveCard(s, 'abstain');
    const r = play(g.state, g.cardId);
    s = r.state;
    expect(eventsOfType(r.events, 'TURN_ENDED')[0]!.event.reason).toBe('card');
    expect(s.turn!.team).toBe(opp);
    s = giveClue(s, 1);
    s = run(s, { type: 'END_TURN', expectedTurnIndex: 1 }, opOf(opp)).state;
    expect(eventsOfType(run(giveClue(s, 1), { type: 'END_TURN', expectedTurnIndex: 2 }, opOf(team)).events, 'TURN_ENDED')).toHaveLength(1);
    const clued = giveClue(s, 1);
    expect(clued.turn!.guessesRemaining).toBe(3); // 1 + 1 + banked 1
  });

  it('Relay banks a guess; Loudspeaker gives the opponent an extra draw', () => {
    let s = giveClue(setupGame(), 1);
    const team = s.turn!.team;
    const opp = otherTeam(team);
    const relay = giveCard(s, 'relay');
    s = play(relay.state, relay.cardId).state;
    s.teams[team].playedThisTurn = false; // test shortcut to play a second card this turn
    const loud = giveCard(s, 'loudspeaker');
    s = play(loud.state, loud.cardId).state;
    const oppHand = s.teams[opp].hand.length;
    const r = run(s, { type: 'END_TURN', expectedTurnIndex: 0 }, opOf(team));
    s = r.state;
    expect(s.teams[opp].hand.length).toBe(Math.min(4, oppHand + 2));
    s = giveClue(s, 1);
    s = run(s, { type: 'END_TURN', expectedTurnIndex: 1 }, opOf(opp)).state;
    const started = eventsOfType(run(s, { type: 'GIVE_CLUE', word: 'QQQQ', count: 1, expectedTurnIndex: 2 }, spyOf(team)).events, 'CLUE_GIVEN')[0]!.event;
    expect(started.guessesAllowed).toBe(3);
  });

  it('Salvage recovers the previous top of the discard, never itself', () => {
    let s = giveClue(setupGame(), 2);
    const team = s.turn!.team;
    s.teams[team].discard.push({ id: 'old', defId: 'overtime', drawnAtTurn: 0 });
    const g = giveCard(s, 'salvage');
    s = play(g.state, g.cardId).state;
    expect(s.teams[team].hand.some((c) => c.id === 'old')).toBe(true);
    expect(s.teams[team].discard.map((c) => c.defId)).toEqual(['salvage']);
  });

  it('Salvage is unplayable with an empty discard pile', () => {
    const s = giveClue(setupGame(), 2);
    const g = giveCard(s, 'salvage');
    g.state.teams[s.turn!.team].discard = [];
    expectErr(g.state, { type: 'PLAY_CARD', cardInstanceId: g.cardId, expectedTurnIndex: 0 }, opOf(s.turn!.team), 'CONDITION_FAILED');
  });

  it('a target that was revealed in the meantime is rejected', () => {
    const s = giveClue(setupGame(), 3);
    const team = s.turn!.team;
    const own = firstOwned(s, team);
    const g = giveCard(s, 'litmus');
    const after = guess(g.state, own).state;
    const r = apply(after, { type: 'PLAY_CARD', cardInstanceId: g.cardId, target: { tiles: [own] }, expectedTurnIndex: 0 }, { actorId: opOf(team), now: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('TARGET_INVALID');
  });

  it('full-pool cards resolve without throwing', () => {
    const s = giveClue(setupGame('full', { cardPool: 'full' }), 3);
    const team = s.turn!.team;
    for (const def of poolDefinitions('full')) {
      const g = giveCard(s, def.id);
      const own = tilesOwned(g.state, team);
      const opp = tilesOwned(g.state, otherTeam(team));
      const target =
        def.targeting.kind === 'tile'
          ? { tiles: [own[0]!] }
          : def.targeting.kind === 'two_tiles'
            ? { tiles: [own[0]!, own[1]!] }
            : def.targeting.kind === 'row'
              ? { row: 0 }
              : def.targeting.kind === 'block2x2'
                ? { block: 0 }
                : def.targeting.kind === 'hand_card'
                  ? { handCardId: g.state.teams[team].hand[0]!.id, category: 'turn' as const }
                  : undefined;
      if (def.id === 'salvage') g.state.teams[team].discard.push({ id: 'd', defId: 'overtime', drawnAtTurn: 0 });
      const r = apply(
        g.state,
        { type: 'PLAY_CARD', cardInstanceId: g.cardId, ...(target ? { target } : {}), expectedTurnIndex: 0 },
        { actorId: opOf(team), now: 0 },
      );
      expect(r.ok, `${def.id}: ${!r.ok ? r.code + ' ' + r.message : ''}`).toBe(true);
      void opp;
    }
  });
});
