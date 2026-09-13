import { describe, expect, it } from 'vitest';
import { SELF } from 'cloudflare:test';
import { ClientViewSchema } from '@gambit/protocol';
import { WsClient, createRoom } from './client';

const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms));

describe('Worker routing', () => {
  it('serves health, creates rooms with valid codes, rejects bad websocket paths', async () => {
    const health = await SELF.fetch('https://gambit.test/api/health');
    expect(await health.json()).toEqual({ ok: true });
    const code = await createRoom();
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    const bad = await SELF.fetch('https://gambit.test/ws/ABC', { headers: { Upgrade: 'websocket' } });
    expect(bad.status).toBe(404);
    const noUpgrade = await SELF.fetch(`https://gambit.test/ws/${code}`);
    expect(noUpgrade.status).toBe(426);
  });
});

describe('Durable Object room over WebSockets', () => {
  it('plays a full turn across four sockets with correct scoping and persistence', async () => {
    const code = await createRoom();
    const ann = await WsClient.connect(code);
    const bo = await WsClient.connect(code);
    const cy = await WsClient.connect(code);
    const di = await WsClient.connect(code);

    ann.send({ type: 'JOIN_GAME', nickname: 'Ann' });
    const session = await ann.waitFor('SESSION');
    expect(session.sessionToken).toMatch(/^[0-9a-f]{32}$/);
    await ann.waitFor('STATE_SNAPSHOT');
    bo.send({ type: 'JOIN_GAME', nickname: 'Bo' });
    await bo.waitFor('SESSION');
    cy.send({ type: 'JOIN_GAME', nickname: 'Cy' });
    await cy.waitFor('SESSION');
    di.send({ type: 'JOIN_GAME', nickname: 'Di' });
    await di.waitFor('SESSION');
    await settle();

    await ann.sendAndAck({ type: 'SET_TEAM', team: 'ember' });
    await ann.sendAndAck({ type: 'SET_ROLE', role: 'spymaster' });
    await bo.sendAndAck({ type: 'SET_TEAM', team: 'ember' });
    await cy.sendAndAck({ type: 'SET_TEAM', team: 'tide' });
    await cy.sendAndAck({ type: 'SET_ROLE', role: 'spymaster' });
    await di.sendAndAck({ type: 'SET_TEAM', team: 'tide' });
    await ann.sendAndAck({ type: 'START_GAME' });
    await settle();

    const annView = ann.last('STATE_SNAPSHOT')!.view;
    const boView = bo.last('STATE_SNAPSHOT')!.view;
    const diView = di.last('STATE_SNAPSHOT')!.view;
    expect(annView.public.status).toBe('in_game');
    expect(annView.spymaster?.key).toHaveLength(25);
    expect(annView.team).toBeNull();
    expect(boView.spymaster).toBeNull();
    expect(boView.team?.hand.length).toBeGreaterThan(0);
    for (const v of [annView, boView, diView]) expect(ClientViewSchema.safeParse(v).success).toBe(true);

    const team = annView.public.turn!.team;
    const spy = team === 'ember' ? ann : cy;
    const op = team === 'ember' ? bo : di;
    const oppOp = team === 'ember' ? di : bo;
    const key = (team === 'ember' ? annView : cy.last('STATE_SNAPSHOT')!.view).spymaster!.key;

    await spy.sendAndAck({ type: 'GIVE_CLUE', word: 'XYZZY', count: 2, expectedTurnIndex: 0 });
    const clue = await oppOp.waitFor('CLUE_GIVEN');
    expect(clue.word).toBe('XYZZY');

    const own = key.findIndex((o) => o === team);
    await op.sendAndAck({ type: 'SELECT_WORD', tileId: own, expectedTurnIndex: 0 });
    const revealed = await oppOp.waitFor('WORD_REVEALED');
    expect(revealed.owner).toBe(team);

    // Opponent operative cannot act; error is addressed only to them.
    const badId = oppOp.send({ type: 'SELECT_WORD', tileId: 0, expectedTurnIndex: 0 });
    const err = await oppOp.waitFor('ERROR', (e) => e.replyTo === badId);
    expect(err.code).toBe('NOT_YOUR_TURN');

    // Reconnect with the session token on a fresh socket restores the same seat and hand.
    const opToken = op.last('SESSION')!.sessionToken;
    const handBefore = op.last('STATE_SNAPSHOT')!.view.team!.hand.map((c) => c.id);
    op.close();
    const again = await WsClient.connect(code);
    again.send({ type: 'HELLO', sessionToken: opToken });
    const snap = await again.waitFor('STATE_SNAPSHOT');
    expect(snap.view.me.playerId).toBe(op.last('SESSION')!.playerId);
    expect(snap.view.team!.hand.map((c) => c.id)).toEqual(handBefore);

    // A forged token is refused.
    const forged = await WsClient.connect(code);
    const fid = forged.send({ type: 'HELLO', sessionToken: 'f'.repeat(32) });
    const ferr = await forged.waitFor('ERROR', (e) => e.replyTo === fid);
    expect(ferr.code).toBe('NOT_AUTHED');

    // Junk frames do not take the room down.
    forged.sendRaw('{not json');
    forged.sendRaw(new ArrayBuffer(4));
    await settle();
    await again.sendAndAck({ type: 'RESYNC' });
    expect(again.last('STATE_SNAPSHOT')!.view.public.status).toBe('in_game');

    for (const c of [ann, bo, cy, di, again, forged]) c.close();
  });

  it('a claimed code is refused for a second creation while the room is live', async () => {
    const code = await createRoom();
    const ws = await WsClient.connect(code);
    ws.send({ type: 'JOIN_GAME', nickname: 'Solo' });
    await ws.waitFor('SESSION');
    const stub = (await import('cloudflare:test')).env.ROOMS.get((await import('cloudflare:test')).env.ROOMS.idFromName(code));
    const res = await stub.fetch(`https://room/claim?code=${code}`, { method: 'POST' });
    expect(await res.json()).toEqual({ ok: false });
    // The lobby knows its real code (the Durable Object learns it from the claim request).
    expect(ws.last('STATE_SNAPSHOT')!.view.public.roomCode).toBe(code);
    ws.close();
  });
});
