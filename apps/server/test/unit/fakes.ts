import type { ClientEnvelope, Command, Event, ServerEnvelope } from '@gambit/protocol';
import { RoomCore } from '../../src/room/RoomCore';
import { MemoryRoomStorage } from '../../src/room/storage';

export class FakeTransport {
  readonly frames = new Map<string, ServerEnvelope[]>();
  readonly closed: Array<{ connId: string; code: number }> = [];
  send(connId: string, data: string): void {
    const list = this.frames.get(connId) ?? [];
    list.push(JSON.parse(data) as ServerEnvelope);
    this.frames.set(connId, list);
  }
  close(connId: string, code: number): void {
    this.closed.push({ connId, code });
  }
  eventsFor(connId: string): Event[] {
    return (this.frames.get(connId) ?? []).map((f) => f.event);
  }
  last<T extends Event['type']>(connId: string, type: T): Extract<Event, { type: T }> | undefined {
    const list = this.eventsFor(connId).filter((e) => e.type === type) as Array<Extract<Event, { type: T }>>;
    return list[list.length - 1];
  }
  clear(): void {
    this.frames.clear();
  }
}

export class Clock {
  now = 1_700_000_000_000;
  advance(ms: number): void {
    this.now += ms;
  }
}

export interface Harness {
  core: RoomCore;
  transport: FakeTransport;
  storage: MemoryRoomStorage;
  clock: Clock;
  alarms: Array<number | null>;
  send(connId: string, command: Command, commandId?: string): Promise<void>;
  raw(connId: string, frame: unknown): Promise<void>;
}

let counter = 0;

export const makeHarness = async (roomCode = 'ABCDEF'): Promise<Harness> => {
  const transport = new FakeTransport();
  const storage = new MemoryRoomStorage();
  const clock = new Clock();
  const alarms: Array<number | null> = [];
  const core = new RoomCore({
    roomCode,
    storage,
    transport,
    now: () => clock.now,
    scheduleAlarm: (at) => alarms.push(at),
    seed: () => 'fixed-seed',
  });
  await core.claim();
  return {
    core,
    transport,
    storage,
    clock,
    alarms,
    send: (connId, command, commandId) =>
      core.handleMessage(connId, JSON.stringify({ v: 1, commandId: commandId ?? `cmd-${++counter}-xxxxxxxx`, command } satisfies ClientEnvelope)),
    raw: (connId, frame) => core.handleMessage(connId, typeof frame === 'string' ? frame : JSON.stringify(frame)),
  };
};

/** Four players joined and seated: c1 Ann (ember spymaster), c2 Bo (ember op), c3 Cy (tide spymaster), c4 Di (tide op). */
export const seatedLobby = async (h: Harness): Promise<void> => {
  await h.send('c1', { type: 'JOIN_GAME', nickname: 'Ann' });
  await h.send('c2', { type: 'JOIN_GAME', nickname: 'Bo' });
  await h.send('c3', { type: 'JOIN_GAME', nickname: 'Cy' });
  await h.send('c4', { type: 'JOIN_GAME', nickname: 'Di' });
  await h.send('c1', { type: 'SET_TEAM', team: 'ember' });
  await h.send('c1', { type: 'SET_ROLE', role: 'spymaster' });
  await h.send('c2', { type: 'SET_TEAM', team: 'ember' });
  await h.send('c3', { type: 'SET_TEAM', team: 'tide' });
  await h.send('c3', { type: 'SET_ROLE', role: 'spymaster' });
  await h.send('c4', { type: 'SET_TEAM', team: 'tide' });
};

export const startedGame = async (h: Harness): Promise<void> => {
  await seatedLobby(h);
  await h.send('c1', { type: 'START_GAME' });
};
