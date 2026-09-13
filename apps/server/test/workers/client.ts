import { SELF } from 'cloudflare:test';
import type { ClientEnvelope, Command, Event, ServerEnvelope } from '@gambit/protocol';

let counter = 0;

/** A test WebSocket client talking to the real Worker + Durable Object inside workerd. */
export class WsClient {
  private socket!: WebSocket;
  readonly received: ServerEnvelope[] = [];
  private waiters: Array<{ pred: (e: Event) => boolean; resolve: (e: Event) => void }> = [];

  static async connect(roomCode: string): Promise<WsClient> {
    const c = new WsClient();
    const res = await SELF.fetch(`https://gambit.test/ws/${roomCode}`, { headers: { Upgrade: 'websocket' } });
    if (res.status !== 101 || !res.webSocket) throw new Error(`upgrade failed: ${res.status}`);
    c.socket = res.webSocket;
    c.socket.accept();
    c.socket.addEventListener('message', (m) => {
      const env = JSON.parse(String(m.data)) as ServerEnvelope;
      c.received.push(env);
      const index = c.received.length - 1;
      c.waiters = c.waiters.filter((w) => {
        if (w.pred(env.event)) {
          c.consumed = Math.max(c.consumed, index + 1);
          w.resolve(env.event);
          return false;
        }
        return true;
      });
    });
    return c;
  }

  send(command: Command): string {
    const commandId = `t-${Date.now()}-${++counter}`;
    const env: ClientEnvelope = { v: 1, commandId, command };
    this.socket.send(JSON.stringify(env));
    return commandId;
  }

  sendRaw(data: string | ArrayBuffer): void {
    this.socket.send(data);
  }

  private consumed = 0;

  /**
   * Resolve with the first not-yet-consumed event matching `type`, whether it already arrived
   * or arrives later. Fan-out happens before the ACK, so matching events are often already here.
   */
  waitFor<T extends Event['type']>(type: T, pred?: (e: Extract<Event, { type: T }>) => boolean, timeoutMs = 5000): Promise<Extract<Event, { type: T }>> {
    const match = (e: Event) => e.type === type && (!pred || pred(e as Extract<Event, { type: T }>));
    for (let i = this.consumed; i < this.received.length; i++) {
      const e = this.received[i]!.event;
      if (match(e)) {
        this.consumed = i + 1;
        return Promise.resolve(e as Extract<Event, { type: T }>);
      }
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeoutMs);
      this.waiters.push({
        pred: match,
        resolve: (e) => {
          clearTimeout(timer);
          resolve(e as Extract<Event, { type: T }>);
        },
      });
    });
  }

  last<T extends Event['type']>(type: T): Extract<Event, { type: T }> | undefined {
    const list = this.received.map((r) => r.event).filter((e) => e.type === type) as Array<Extract<Event, { type: T }>>;
    return list[list.length - 1];
  }

  async sendAndAck(command: Command): Promise<void> {
    const id = this.send(command);
    await Promise.race([
      this.waitFor('ACK', (e) => e.replyTo === id),
      this.waitFor('ERROR', (e) => e.replyTo === id).then((e) => {
        throw new Error(`${command.type} failed: ${e.code} ${e.message}`);
      }),
    ]);
  }

  close(): void {
    this.socket.close(1000, 'done');
  }
}

export const createRoom = async (): Promise<string> => {
  const res = await SELF.fetch('https://gambit.test/api/rooms', { method: 'POST' });
  if (res.status !== 201) throw new Error(`create failed: ${res.status}`);
  const body = (await res.json()) as { roomCode: string };
  return body.roomCode;
};
