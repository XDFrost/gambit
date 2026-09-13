/**
 * Local development server. Runs the exact same RoomCore as the Durable Object, over Node's
 * `http` + the `ws` package, with in-memory storage and setTimeout alarms.
 * Not used in production; the Worker (src/worker.ts) is the deploy target.
 */
import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { RoomCodeSchema } from '@gambit/protocol';
import { RoomCore } from '../src/room/RoomCore';
import { MemoryRoomStorage } from '../src/room/storage';
import { generateRoomCode } from '../src/room/roomCode';

// Deliberately not `PORT`: dev harnesses often set that for the web server.
const PORT = Number(process.env.ROOM_PORT ?? 8787);

class LocalRoom {
  readonly core: RoomCore;
  readonly sockets = new Map<string, WebSocket>();
  private alarm: NodeJS.Timeout | null = null;

  constructor(readonly code: string) {
    this.core = new RoomCore({
      roomCode: code,
      storage: new MemoryRoomStorage(),
      transport: {
        send: (id, data) => {
          const ws = this.sockets.get(id);
          if (ws && ws.readyState === ws.OPEN) ws.send(data);
        },
        close: (id, c, reason) => {
          this.sockets.get(id)?.close(c, reason);
          this.sockets.delete(id);
        },
      },
      scheduleAlarm: (at) => {
        if (this.alarm) clearTimeout(this.alarm);
        this.alarm = null;
        if (at === null) return;
        this.alarm = setTimeout(() => void this.core.tick(), Math.max(0, at - Date.now()));
      },
    });
  }
}

const rooms = new Map<string, LocalRoom>();
const roomFor = (code: string): LocalRoom => {
  let r = rooms.get(code);
  if (!r) {
    r = new LocalRoom(code);
    rooms.set(code, r);
  }
  return r;
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'POST' && url.pathname === '/api/rooms') {
    for (let i = 0; i < 6; i++) {
      const code = generateRoomCode();
      if (await roomFor(code).core.claim()) {
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ roomCode: code }));
        return;
      }
    }
    res.writeHead(503);
    res.end('{"error":"no code"}');
    return;
  }
  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
    return;
  }
  res.writeHead(404);
  res.end('{"error":"Not found"}');
});

const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const m = url.pathname.match(/^\/ws\/([A-Za-z0-9]{6})$/);
  const parsed = m ? RoomCodeSchema.safeParse(m[1]!.toUpperCase()) : null;
  if (!parsed?.success) {
    socket.destroy();
    return;
  }
  const room = roomFor(parsed.data);
  wss.handleUpgrade(req, socket, head, (ws) => {
    const connId = crypto.randomUUID();
    room.sockets.set(connId, ws);
    room.core.handleOpen(connId);
    ws.on('message', (data, isBinary) => {
      void room.core.handleMessage(connId, isBinary ? data : data.toString());
    });
    ws.on('close', () => {
      room.sockets.delete(connId);
      void room.core.handleClose(connId);
    });
  });
});

server.listen(PORT, () => {
  console.log(`[gambit] local room server on http://localhost:${PORT} (in-memory, dev only)`);
});
