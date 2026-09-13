import { describe, expect, it } from 'vitest';
import { ClientViewSchema, ServerEnvelopeSchema } from '@gambit/protocol';
import { GRACE_MS, TEAM_AWAY_MS } from '../../src/room/RoomCore';
import { KEYS } from '../../src/room/storage';
import { makeHarness, seatedLobby, startedGame } from './fakes';

const spyConn = (h: Awaited<ReturnType<typeof makeHarness>>, team: 'ember' | 'tide') => (team === 'ember' ? 'c1' : 'c3');
const opConn = (h: Awaited<ReturnType<typeof makeHarness>>, team: 'ember' | 'tide') => (team === 'ember' ? 'c2' : 'c4');

describe('RoomCore: joining and sessions', () => {
  it('JOIN issues a session, a snapshot, and broadcasts PLAYER_JOINED; frames validate', async () => {
    const h = await makeHarness();
    await h.send('c1', { type: 'JOIN_GAME', nickname: 'Ann' });
    const session = h.transport.last('c1', 'SESSION');
    expect(session?.playerId).toBe('p1');
    expect(session?.sessionToken).toMatch(/^[0-9a-f]{32}$/);
    const snap = h.transport.last('c1', 'STATE_SNAPSHOT');
    expect(snap?.view.me.isHost).toBe(true);
    for (const frame of h.transport.frames.get('c1')!) expect(ServerEnvelopeSchema.safeParse(frame).success).toBe(true);
    await h.send('c2', { type: 'JOIN_GAME', nickname: 'Bo' });
    expect(h.transport.last('c1', 'PLAYER_JOINED')?.player.nickname).toBe('Bo');
    expect(await h.storage.get(KEYS.session(session!.sessionToken))).toEqual({ playerId: 'p1' });
  });

  it('HELLO with a valid token rebinds the seat; a forged token is rejected', async () => {
    const h = await makeHarness();
    await h.send('c1', { type: 'JOIN_GAME', nickname: 'Ann' });
    const token = h.transport.last('c1', 'SESSION')!.sessionToken;
    await h.core.handleClose('c1');
    await h.send('c9', { type: 'HELLO', sessionToken: token });
    expect(h.transport.last('c9', 'STATE_SNAPSHOT')?.view.me.playerId).toBe('p1');
    await h.send('c8', { type: 'HELLO', sessionToken: 'f'.repeat(32) });
    expect(h.transport.last('c8', 'ERROR')?.code).toBe('NOT_AUTHED');
    expect(h.transport.last('c8', 'STATE_SNAPSHOT')).toBeUndefined();
  });

  it('commands before joining are NOT_AUTHED', async () => {
    const h = await makeHarness();
    await h.send('c1', { type: 'TOGGLE_READY' });
    expect(h.transport.last('c1', 'ERROR')?.code).toBe('NOT_AUTHED');
  });
});

describe('RoomCore: frame hygiene', () => {
  it('rejects junk, oversized, binary and schema-invalid frames without crashing', async () => {
    const h = await makeHarness();
    await h.raw('c1', 'not json');
    await h.raw('c1', 'x'.repeat(5000));
    await h.core.handleMessage('c1', new ArrayBuffer(8));
    await h.raw('c1', { v: 1, commandId: 'abcdefghij', command: { type: 'SELECT_WORD', tileId: 99 } });
    await h.raw('c1', { v: 2 });
    const errors = h.transport.eventsFor('c1').filter((e) => e.type === 'ERROR');
    expect(errors).toHaveLength(5);
    expect(errors.every((e) => e.type === 'ERROR' && e.code === 'BAD_PAYLOAD')).toBe(true);
    // Still functional afterwards.
    await h.send('c1', { type: 'JOIN_GAME', nickname: 'Ann' });
    expect(h.transport.last('c1', 'SESSION')).toBeDefined();
  });

  it('deduplicates by commandId and replays the original response', async () => {
    const h = await makeHarness();
    await h.send('c1', { type: 'JOIN_GAME', nickname: 'Ann' }, 'dup-command-1');
    const before = h.transport.frames.get('c1')!.length;
    await h.send('c1', { type: 'JOIN_GAME', nickname: 'Ann' }, 'dup-command-1');
    const after = h.transport.frames.get('c1')!;
    expect(after.length).toBe(before * 2);
    expect(after.filter((f) => f.event.type === 'SESSION')).toHaveLength(2);
    expect(after.filter((f) => f.event.type === 'ERROR')).toHaveLength(0);
  });

  it('rate limits floods and closes abusive connections', async () => {
    const h = await makeHarness();
    await h.send('c1', { type: 'JOIN_GAME', nickname: 'Ann' });
    for (let i = 0; i < 40; i++) await h.send('c1', { type: 'RESYNC' });
    const codes = h.transport.eventsFor('c1').filter((e) => e.type === 'ERROR').map((e) => (e.type === 'ERROR' ? e.code : ''));
    expect(codes).toContain('RATE_LIMITED');
    expect(h.transport.closed.some((c) => c.connId === 'c1' && c.code === 1008)).toBe(true);
  });
});

describe('RoomCore: a full game over the wire', () => {
  it('plays clue, guess, card and turn end with correctly scoped events', async () => {
    const h = await makeHarness();
    await startedGame(h);
    const view = h.transport.last('c2', 'STATE_SNAPSHOT')!.view;
    expect(view.public.status).toBe('in_game');
    const team = view.public.turn!.team;
    const spy = spyConn(h, team);
    const op = opConn(h, team);
    const oppOp = opConn(h, team === 'ember' ? 'tide' : 'ember');

    // Spymaster sees the key; operatives do not; opponents do not see this team's hand.
    const spyView = h.transport.last(spy, 'STATE_SNAPSHOT')!.view;
    expect(spyView.spymaster?.key).toHaveLength(25);
    expect(spyView.team).toBeNull();
    const opView = h.transport.last(op, 'STATE_SNAPSHOT')!.view;
    expect(opView.spymaster).toBeNull();
    expect(opView.team!.hand.length).toBe(3);
    const oppView = h.transport.last(oppOp, 'STATE_SNAPSHOT')!.view;
    expect(oppView.team!.team).not.toBe(team);
    for (const pid of ['c1', 'c2', 'c3', 'c4']) {
      expect(ClientViewSchema.safeParse(h.transport.last(pid, 'STATE_SNAPSHOT')!.view).success).toBe(true);
    }
    // CARD_DRAWN went to the team in full and to others as a count.
    const drawnOp = h.transport.eventsFor(op).filter((e) => e.type === 'CARD_DRAWN');
    const drawnOpp = h.transport.eventsFor(oppOp).filter((e) => e.type === 'CARD_DRAWN' && e.team === team);
    expect(drawnOp.some((e) => e.type === 'CARD_DRAWN' && e.card)).toBe(true);
    expect(drawnOpp.every((e) => e.type === 'CARD_DRAWN' && !e.card)).toBe(true);

    h.transport.clear();
    await h.send(spy, { type: 'GIVE_CLUE', word: 'XYZZY', count: 2, expectedTurnIndex: 0 });
    expect(h.transport.last(oppOp, 'CLUE_GIVEN')?.word).toBe('XYZZY');

    // Operative plays a free card (Sonar) if held, otherwise skip.
    const hand = h.transport.last(op, 'STATE_SNAPSHOT')!.view.team!.hand;
    const sonar = hand.find((c) => c.defId === 'sonar');
    if (sonar) {
      await h.send(op, { type: 'PLAY_CARD', cardInstanceId: sonar.id, target: { tiles: [12] }, expectedTurnIndex: 0 });
      expect(h.transport.last(op, 'INFO_REVEALED')).toBeDefined();
      expect(h.transport.last(oppOp, 'INFO_REVEALED')).toBeUndefined();
      expect(h.transport.last(oppOp, 'CARD_PLAYED')?.cardDefId).toBe('sonar');
    }

    // Guess a word the spymaster can see is theirs.
    const key = spyView.spymaster!.key;
    const own = key.findIndex((o) => o === team);
    await h.send(op, { type: 'SELECT_WORD', tileId: own, expectedTurnIndex: 0 });
    expect(h.transport.last(oppOp, 'WORD_REVEALED')?.owner).toBe(team);
    await h.send(op, { type: 'END_TURN', expectedTurnIndex: 0 });
    expect(h.transport.last('c1', 'TURN_ENDED')?.reason).toBe('voluntary');
    expect(h.transport.last('c1', 'STATE_SNAPSHOT')!.view.public.turn!.index).toBe(1);

    // Persisted.
    const stored = await h.storage.get<{ eventSeq: number }>(KEYS.state);
    expect(stored?.eventSeq).toBeGreaterThan(0);
    const events = await h.storage.list('ev:');
    expect(events.size).toBe(stored!.eventSeq);
  });

  it('rejects unauthorized and stale actions with the right codes', async () => {
    const h = await makeHarness();
    await startedGame(h);
    const team = h.transport.last('c2', 'STATE_SNAPSHOT')!.view.public.turn!.team;
    const spy = spyConn(h, team);
    const op = opConn(h, team);
    const oppOp = opConn(h, team === 'ember' ? 'tide' : 'ember');
    h.transport.clear();
    await h.send(op, { type: 'GIVE_CLUE', word: 'XYZZY', count: 1, expectedTurnIndex: 0 });
    expect(h.transport.last(op, 'ERROR')?.code).toBe('WRONG_ROLE');
    await h.send(spy, { type: 'GIVE_CLUE', word: 'XYZZY', count: 1, expectedTurnIndex: 0 });
    await h.send(oppOp, { type: 'SELECT_WORD', tileId: 0, expectedTurnIndex: 0 });
    expect(h.transport.last(oppOp, 'ERROR')?.code).toBe('NOT_YOUR_TURN');
    await h.send(spy, { type: 'SELECT_WORD', tileId: 0, expectedTurnIndex: 0 });
    expect(h.transport.last(spy, 'ERROR')?.code).toBe('WRONG_ROLE');
    await h.send(op, { type: 'PLAY_CARD', cardInstanceId: 'stolen', expectedTurnIndex: 0 });
    expect(h.transport.last(op, 'ERROR')?.code).toBe('CARD_NOT_IN_HAND');
    await h.send(op, { type: 'SELECT_WORD', tileId: 0, expectedTurnIndex: 7 });
    expect(h.transport.last(op, 'ERROR')?.code).toBe('STALE_STATE');
    expect(h.transport.last(op, 'ERROR')?.replyTo).toBeDefined();
  });
});

describe('RoomCore: presence and timers', () => {
  it('marks a player away after the grace period and ends a fully absent team’s turn', async () => {
    const h = await makeHarness();
    await startedGame(h);
    const team = h.transport.last('c2', 'STATE_SNAPSHOT')!.view.public.turn!.team;
    const spy = spyConn(h, team);
    const op = opConn(h, team);
    await h.core.handleClose(spy);
    await h.core.handleClose(op);
    expect(h.alarms[h.alarms.length - 1]).toBe(h.clock.now + GRACE_MS);
    h.clock.advance(GRACE_MS);
    h.transport.clear();
    await h.core.tick();
    const disc = h.transport.eventsFor('c1' === spy ? 'c3' : 'c1').filter((e) => e.type === 'PLAYER_DISCONNECTED');
    expect(disc).toHaveLength(2);
    // The team-away deadline is now scheduled.
    const lastAlarm = h.alarms[h.alarms.length - 1]!;
    expect(lastAlarm).toBe(h.clock.now + TEAM_AWAY_MS);
    h.clock.advance(TEAM_AWAY_MS);
    await h.core.tick();
    const other = spy === 'c1' ? 'c3' : 'c1';
    expect(h.transport.last(other, 'TURN_ENDED')?.reason).toBe('timeout');
    expect(h.transport.last(other, 'STATE_SNAPSHOT')!.view.public.turn!.index).toBe(1);
  });

  it('a reconnect inside the grace period cancels the away marking', async () => {
    const h = await makeHarness();
    await seatedLobby(h);
    const token = h.transport.last('c2', 'SESSION')!.sessionToken;
    await h.core.handleClose('c2');
    h.clock.advance(GRACE_MS / 2);
    await h.send('c5', { type: 'HELLO', sessionToken: token });
    h.clock.advance(GRACE_MS);
    h.transport.clear();
    await h.core.tick();
    expect(h.transport.eventsFor('c1').filter((e) => e.type === 'PLAYER_DISCONNECTED')).toHaveLength(0);
  });

  it('claim() refuses a live room and accepts a stale one', async () => {
    const h = await makeHarness();
    await seatedLobby(h);
    expect(await h.core.claim()).toBe(false);
    for (const c of ['c1', 'c2', 'c3', 'c4']) await h.core.handleClose(c);
    h.clock.advance(2 * 60 * 60 * 1000);
    expect(await h.core.claim()).toBe(true);
    expect(h.transport.last('c1', 'STATE_SNAPSHOT')).toBeDefined();
  });
});
