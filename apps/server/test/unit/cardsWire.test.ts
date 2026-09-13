import { describe, expect, it } from 'vitest';
import type { ClientView, TeamId } from '@gambit/protocol';
import { otherTeam } from '@gambit/protocol';
import { makeHarness, startedGame, type Harness } from './fakes';

/**
 * Plays every MVP card through the real room pipeline (Zod -> RoomCore -> engine -> fan-out) and
 * checks what the clients receive: ACK vs ERROR, playability, targets, private info, and effects.
 * This is the wire-level audit of "do the cards actually work".
 */

const conn = { emberSpy: 'c1', emberOp: 'c2', tideSpy: 'c3', tideOp: 'c4' } as const;
const spyOf = (t: TeamId) => (t === 'ember' ? conn.emberSpy : conn.tideSpy);
const opOf = (t: TeamId) => (t === 'ember' ? conn.emberOp : conn.tideOp);

interface Game {
  h: Harness;
  team: TeamId;
  opp: TeamId;
  view: () => ClientView; // active operative's latest snapshot
  oppView: () => ClientView;
  key: () => ReadonlyArray<string>;
  clue: (count?: number) => Promise<void>;
  /** End the active team's turn, let the opponent clue and pass, come back with a fresh clue. */
  nextOwnTurn: () => Promise<void>;
  give: (defId: string) => Promise<string>;
  play: (cardId: string, target?: { tiles: number[] }) => Promise<{ ok: boolean; code?: string; message?: string }>;
  errorsFor: (c: string) => string[];
}

const setup = async (): Promise<Game> => {
  const h = await makeHarness();
  await startedGame(h);
  const first = h.transport.last('c2', 'STATE_SNAPSHOT')!.view;
  const team = first.public.turn!.team;
  const opp = otherTeam(team);
  const view = () => h.transport.last(opOf(team), 'STATE_SNAPSHOT')!.view;
  const oppView = () => h.transport.last(opOf(opp), 'STATE_SNAPSHOT')!.view;
  const key = () => h.transport.last(spyOf(team), 'STATE_SNAPSHOT')!.view.spymaster!.key;
  const clue = async (count = 3) => {
    const idx = view().public.turn!.index;
    await h.send(spyOf(view().public.turn!.team), { type: 'GIVE_CLUE', word: 'XYZZY', count, expectedTurnIndex: idx });
  };
  const nextOwnTurn = async () => {
    let t = view().public.turn!;
    if (t.team === team) {
      await h.send(opOf(team), { type: 'END_TURN', expectedTurnIndex: t.index });
      t = view().public.turn!;
    }
    expect(t.team).toBe(opp);
    if (t.phase === 'clue') await h.send(spyOf(opp), { type: 'GIVE_CLUE', word: 'XYZZY', count: 1, expectedTurnIndex: t.index });
    await h.send(opOf(opp), { type: 'END_TURN', expectedTurnIndex: view().public.turn!.index });
    expect(view().public.turn!.team).toBe(team);
    await clue();
  };
  const give = async (defId: string) => {
    await h.core.applyInternal({ type: 'INTERNAL_GIVE_CARD', team, defId });
    const card = [...view().team!.hand].reverse().find((c) => c.defId === defId);
    if (!card) throw new Error(`card ${defId} not in hand after give`);
    return card.id;
  };
  const play = async (cardId: string, target?: { tiles: number[] }) => {
    const idx = view().public.turn!.index;
    const before = h.transport.eventsFor(opOf(team)).length;
    await h.send(opOf(team), { type: 'PLAY_CARD', cardInstanceId: cardId, ...(target ? { target } : {}), expectedTurnIndex: idx }, `play-${cardId}-${idx}`);
    const after = h.transport.eventsFor(opOf(team)).slice(before);
    const err = after.find((e) => e.type === 'ERROR');
    if (err && err.type === 'ERROR') return { ok: false, code: err.code, message: err.message };
    return { ok: true };
  };
  const errorsFor = (c: string) => h.transport.eventsFor(c).filter((e) => e.type === 'ERROR').map((e) => (e.type === 'ERROR' ? e.code : ''));
  await clue();
  return { h, team, opp, view, oppView, key, clue, nextOwnTurn, give, play, errorsFor };
};

const ownTile = (g: Game) => g.view().public.tiles.find((t) => !t.revealed && g.key()[t.id] === g.team)!.id;
const oppTile = (g: Game) => g.view().public.tiles.find((t) => !t.revealed && g.key()[t.id] === g.opp)!.id;

describe('MVP cards over the wire', () => {
  it('Overtime adds a guess', async () => {
    const g = await setup();
    const before = g.view().public.turn!.guessesRemaining as number;
    const id = await g.give('overtime');
    expect(g.view().team!.playability[id]?.playable).toBe(true);
    expect(await g.play(id)).toEqual({ ok: true });
    expect(g.view().public.turn!.guessesRemaining).toBe(before + 1);
    expect(g.view().public.teams[g.team].discard).toContain('overtime');
    expect(g.view().public.teams[g.team].playedThisTurn).toBe(true);
  });

  it('Litmus costs a guess and answers only the playing team', async () => {
    const g = await setup();
    const id = await g.give('litmus');
    const tile = ownTile(g);
    const p = g.view().team!.playability[id]!;
    expect(p.playable).toBe(true);
    expect(p.validTiles).toContain(tile);
    const before = g.view().public.turn!.guessesRemaining as number;
    expect(await g.play(id, { tiles: [tile] })).toEqual({ ok: true });
    expect(g.view().public.turn!.guessesRemaining).toBe(before - 1);
    const info = g.h.transport.last(opOf(g.team), 'INFO_REVEALED');
    expect(info?.result).toBe('yes');
    expect(g.view().team!.knownOwners[String(tile)]).toBe(g.team);
    expect(g.h.transport.last(opOf(g.opp), 'INFO_REVEALED')).toBeUndefined();
    expect(g.h.transport.last(spyOf(g.team), 'INFO_REVEALED')).toBeUndefined();
    expect(g.oppView().public.turn!.guessesRemaining).toBe(before - 1);
  });

  it('Litmus is blocked when it would leave zero guesses', async () => {
    const g = await setup();
    await g.nextOwnTurn(); // fresh turn with count 3 -> 4 guesses
    const id = await g.give('litmus');
    // burn guesses down to 1 by guessing own words (advance the fake clock past the per-guess rate limit)
    for (let i = 0; i < 3; i++) {
      g.h.clock.advance(500);
      const t = ownTile(g);
      await g.h.send(opOf(g.team), { type: 'SELECT_WORD', tileId: t, expectedTurnIndex: g.view().public.turn!.index });
    }
    expect(g.view().public.turn!.guessesRemaining).toBe(1);
    expect(g.view().team!.playability[id]?.playable).toBe(false);
    const r = await g.play(id, { tiles: [ownTile(g)] });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('COST_UNPAYABLE');
  });

  it('Triangulate shows three tiles and marks one as yours', async () => {
    const g = await setup();
    const id = await g.give('triangulate');
    expect(await g.play(id)).toEqual({ ok: true });
    const info = g.h.transport.last(opOf(g.team), 'INFO_REVEALED')!;
    expect(info.tiles).toHaveLength(3);
    expect(info.tiles).toContain(Number(info.result));
    expect(g.view().team!.knownOwners[info.result]).toBe(g.team);
    // Everyone sees which three tiles were examined.
    const pub = g.h.transport.last(opOf(g.opp), 'EFFECT_APPLIED')!;
    expect(pub.kind).toBe('info');
    expect(pub.tiles).toHaveLength(3);
  });

  it('Sonar is free and buckets neighbours', async () => {
    const g = await setup();
    const id = await g.give('sonar');
    const before = g.view().public.turn!.guessesRemaining;
    expect(await g.play(id, { tiles: [12] })).toEqual({ ok: true });
    expect(g.view().public.turn!.guessesRemaining).toBe(before);
    expect(['0', '1', '2+']).toContain(g.h.transport.last(opOf(g.team), 'INFO_REVEALED')!.result);
  });

  it('Quarantine locks a tile for the opponent next turn, then expires', async () => {
    const g = await setup();
    const id = await g.give('quarantine');
    const tile = oppTile(g);
    expect(await g.play(id, { tiles: [tile] })).toEqual({ ok: true });
    expect(g.view().public.tiles.find((t) => t.id === tile)!.lockedFor).toBe(g.opp);
    expect(g.view().public.effects.some((e) => e.kind === 'lock' && e.tileId === tile)).toBe(true);
    // Opponent cannot select it on their turn.
    await g.h.send(opOf(g.team), { type: 'END_TURN', expectedTurnIndex: g.view().public.turn!.index });
    await g.h.send(spyOf(g.opp), { type: 'GIVE_CLUE', word: 'XYZZY', count: 2, expectedTurnIndex: g.view().public.turn!.index });
    await g.h.send(opOf(g.opp), { type: 'SELECT_WORD', tileId: tile, expectedTurnIndex: g.view().public.turn!.index });
    expect(g.errorsFor(opOf(g.opp))).toContain('TILE_LOCKED');
    await g.h.send(opOf(g.opp), { type: 'END_TURN', expectedTurnIndex: g.view().public.turn!.index });
    expect(g.view().public.tiles.find((t) => t.id === tile)!.lockedFor).toBeUndefined();
  });

  it('Ward shields a tile from opponent cards', async () => {
    const g = await setup();
    const id = await g.give('ward');
    const tile = ownTile(g);
    expect(await g.play(id, { tiles: [tile] })).toEqual({ ok: true });
    expect(g.view().public.tiles.find((t) => t.id === tile)!.shieldedBy).toBe(g.team);
    await g.h.send(opOf(g.team), { type: 'END_TURN', expectedTurnIndex: g.view().public.turn!.index });
    await g.h.send(spyOf(g.opp), { type: 'GIVE_CLUE', word: 'XYZZY', count: 2, expectedTurnIndex: g.view().public.turn!.index });
    await g.h.core.applyInternal({ type: 'INTERNAL_GIVE_CARD', team: g.opp, defId: 'quarantine' });
    const oppHand = g.oppView().team!.hand;
    const q = [...oppHand].reverse().find((c) => c.defId === 'quarantine')!;
    expect(g.oppView().team!.playability[q.id]!.validTiles).not.toContain(tile);
    await g.h.send(opOf(g.opp), { type: 'PLAY_CARD', cardInstanceId: q.id, target: { tiles: [tile] }, expectedTurnIndex: g.view().public.turn!.index });
    expect(g.errorsFor(opOf(g.opp))).toContain('TARGET_INVALID');
  });

  it('Dredge reveals a random neutral for everyone without ending the turn', async () => {
    const g = await setup();
    const id = await g.give('dredge');
    expect(await g.play(id)).toEqual({ ok: true });
    const rev = g.h.transport.last(opOf(g.opp), 'WORD_REVEALED')!;
    expect(rev.owner).toBe('neutral');
    expect(rev.outcome).toBe('card');
    expect(g.view().public.turn!.team).toBe(g.team);
    expect(g.view().public.tiles.find((t) => t.id === rev.tileId)!.revealed).toBe(true);
  });

  it('Second Chance forgives one wrong guess', async () => {
    const g = await setup();
    const id = await g.give('second_chance');
    expect(await g.play(id)).toEqual({ ok: true });
    expect(g.view().public.turn!.forgiveAvailable).toBe(true);
    const neutral = g.view().public.tiles.find((t) => !t.revealed && g.key()[t.id] === 'neutral')!.id;
    await g.h.send(opOf(g.team), { type: 'SELECT_WORD', tileId: neutral, expectedTurnIndex: g.view().public.turn!.index });
    expect(g.h.transport.last(opOf(g.team), 'WORD_REVEALED')!.outcome).toBe('forgiven');
    expect(g.view().public.turn!.team).toBe(g.team);
    expect(g.view().public.turn!.forgiveAvailable).toBe(false);
  });

  it('Abstain ends the turn and banks a guess for the next one', async () => {
    const g = await setup();
    const id = await g.give('abstain');
    expect(await g.play(id)).toEqual({ ok: true });
    expect(g.view().public.turn!.team).toBe(g.opp);
    expect(g.h.transport.last(opOf(g.team), 'TURN_ENDED')!.reason).toBe('card');
    await g.h.send(spyOf(g.opp), { type: 'GIVE_CLUE', word: 'XYZZY', count: 1, expectedTurnIndex: g.view().public.turn!.index });
    await g.h.send(opOf(g.opp), { type: 'END_TURN', expectedTurnIndex: g.view().public.turn!.index });
    expect(g.h.transport.last(opOf(g.team), 'TURN_STARTED')!.bankedGuesses).toBe(1);
    await g.clue(2);
    expect(g.view().public.turn!.guessesRemaining).toBe(4); // 2 + 1 + banked 1
  });

  it('Relay banks a guess; Loudspeaker adds two and gives the opponent an extra draw', async () => {
    const g = await setup();
    const relay = await g.give('relay');
    expect(await g.play(relay)).toEqual({ ok: true });
    expect(g.view().public.effects.some((e) => e.kind === 'banked_guesses' && e.ownerTeam === g.team)).toBe(true);
    await g.nextOwnTurn();
    expect(g.view().public.turn!.guessesRemaining).toBe(5); // 3 + 1 + banked 1
    const loud = await g.give('loudspeaker');
    expect(await g.play(loud)).toEqual({ ok: true });
    expect(g.view().public.turn!.guessesRemaining).toBe(6); // cap: +2 extra total, banked counted
    const oppHandBefore = g.oppView().team!.hand.length;
    await g.h.send(opOf(g.team), { type: 'END_TURN', expectedTurnIndex: g.view().public.turn!.index });
    expect(g.oppView().team!.hand.length).toBe(Math.min(4, oppHandBefore + 2));
  });

  it('Salvage recovers the previous top of the discard and is blocked when empty', async () => {
    const g = await setup();
    const salvage = await g.give('salvage');
    expect(g.view().team!.playability[salvage]?.playable).toBe(false);
    expect(g.view().team!.playability[salvage]?.reason).toMatch(/discard/i);
    const overtime = await g.give('overtime');
    expect(await g.play(overtime)).toEqual({ ok: true });
    await g.nextOwnTurn();
    expect(g.view().team!.playability[salvage]?.playable).toBe(true);
    const handBefore = g.view().team!.hand.length;
    expect(await g.play(salvage)).toEqual({ ok: true });
    expect(g.view().team!.hand.some((c) => c.defId === 'overtime')).toBe(true);
    expect(g.view().team!.hand.length).toBe(handBefore); // salvage out, overtime back in
    expect(g.view().public.teams[g.team].discard).toEqual(['salvage']);
  });

  it('one card per turn is enforced and the second card explains why', async () => {
    const g = await setup();
    const a = await g.give('overtime');
    const b = await g.give('relay');
    expect(await g.play(a)).toEqual({ ok: true });
    expect(g.view().team!.playability[b]?.playable).toBe(false);
    expect(g.view().team!.playability[b]?.reason).toMatch(/one card/i);
    expect((await g.play(b)).code).toBe('ALREADY_PLAYED');
  });
});
