import type { Env } from '../env';
import { RoomCore, type ConnAttachment } from './RoomCore';
import type { RoomStorage } from './storage';

class DurableObjectRoomStorage implements RoomStorage {
  constructor(private readonly s: DurableObjectStorage) {}
  get<T>(key: string) {
    return this.s.get<T>(key);
  }
  put(entries: Record<string, unknown>) {
    return this.s.put(entries);
  }
  async delete(keys: string[]) {
    if (keys.length) await this.s.delete(keys);
  }
  list<T>(prefix: string, opts: { start?: string; limit?: number } = {}) {
    return this.s.list<T>({ prefix, ...opts });
  }
  deleteAll() {
    return this.s.deleteAll();
  }
}

interface Attachment extends ConnAttachment {
  connId: string;
}

/**
 * One instance per room code. Holds the WebSockets (hibernatable) and delegates all logic to
 * RoomCore. Durable Objects are single-threaded, so commands are naturally serialized.
 */
export class RoomDurableObject {
  private readonly core: RoomCore;
  private readonly ids = new WeakMap<WebSocket, string>();
  private readonly sockets = new Map<string, WebSocket>();
  private restored = false;

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {
    void this.env;
    this.core = new RoomCore({
      roomCode: 'unknown',
      storage: new DurableObjectRoomStorage(ctx.storage),
      transport: {
        send: (connId, data) => {
          try {
            this.sockets.get(connId)?.send(data);
          } catch {
            /* socket already closed */
          }
        },
        close: (connId, code, reason) => {
          try {
            this.sockets.get(connId)?.close(code, reason);
          } catch {
            /* ignore */
          }
          this.sockets.delete(connId);
        },
        attach: (connId, data) => {
          const ws = this.sockets.get(connId);
          if (ws) ws.serializeAttachment({ connId, playerId: data.playerId } satisfies Attachment);
        },
      },
      scheduleAlarm: (at) => {
        if (at === null) void ctx.storage.deleteAlarm();
        else void ctx.storage.setAlarm(at);
      },
    });
  }

  /** After hibernation the in-memory maps are empty; rebuild them from the accepted sockets. */
  private restore(): void {
    if (this.restored) return;
    this.restored = true;
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      const connId = att?.connId ?? crypto.randomUUID();
      this.ids.set(ws, connId);
      this.sockets.set(connId, ws);
      this.core.restoreConnection(connId, att ? { playerId: att.playerId } : null);
    }
  }

  async fetch(request: Request): Promise<Response> {
    this.restore();
    const url = new URL(request.url);
    if (url.pathname === '/claim') {
      const code = url.searchParams.get('code');
      if (!code) return Response.json({ ok: false, error: 'code required' }, { status: 400 });
      const ok = await this.core.claim(code);
      return Response.json({ ok });
    }
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const connId = crypto.randomUUID();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ connId, playerId: null } satisfies Attachment);
    this.ids.set(server, connId);
    this.sockets.set(connId, server);
    this.core.handleOpen(connId);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    this.restore();
    const connId = this.connIdOf(ws);
    await this.core.handleMessage(connId, message);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.restore();
    const connId = this.connIdOf(ws);
    this.sockets.delete(connId);
    await this.core.handleClose(connId);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  async alarm(): Promise<void> {
    this.restore();
    await this.core.tick();
  }

  private connIdOf(ws: WebSocket): string {
    let id = this.ids.get(ws);
    if (!id) {
      const att = ws.deserializeAttachment() as Attachment | null;
      id = att?.connId ?? crypto.randomUUID();
      this.ids.set(ws, id);
      this.sockets.set(id, ws);
      this.core.restoreConnection(id, att ? { playerId: att.playerId } : null);
    }
    return id;
  }
}
