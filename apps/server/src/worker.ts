import { RoomCodeSchema } from '@gambit/protocol';
import type { Env } from './env';
import { generateRoomCode } from './room/roomCode';
export { RoomDurableObject } from './room/RoomDurableObject';

/**
 * Origins allowed to call the API and open WebSockets. Empty list = allow any origin
 * (local development). In production set ALLOWED_ORIGINS to your frontend URL(s).
 */
const allowedOrigins = (env: Env): string[] =>
  (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);

const originAllowed = (env: Env, origin: string | null): boolean => {
  const list = allowedOrigins(env);
  if (list.length === 0) return true;
  return origin !== null && list.includes(origin);
};

const corsHeaders = (env: Env, origin: string | null): HeadersInit => {
  const list = allowedOrigins(env);
  const allow = list.length === 0 ? '*' : origin && list.includes(origin) ? origin : list[0]!;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
};

const json = (body: unknown, status: number, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

/** Create a room: pick a code, ask that room's Durable Object to claim it, retry on collision. */
const createRoom = async (env: Env, cors: HeadersInit): Promise<Response> => {
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateRoomCode();
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    const res = await stub.fetch(`https://room/claim?code=${code}`, { method: 'POST' });
    const body = (await res.json()) as { ok: boolean };
    if (body.ok) return json({ roomCode: code }, 201, cors);
  }
  return json({ error: 'Could not allocate a room code, try again.' }, 503, cors);
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(env, origin);

    if (url.pathname.startsWith('/api/')) {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      if (!originAllowed(env, origin) && origin !== null) return json({ error: 'Origin not allowed' }, 403, cors);
      if (url.pathname === '/api/rooms' && request.method === 'POST') return createRoom(env, cors);
      if (url.pathname === '/api/health') return json({ ok: true }, 200, cors);
      return json({ error: 'Not found' }, 404, cors);
    }

    const ws = url.pathname.match(/^\/ws\/([A-Za-z0-9]{6})$/);
    if (ws) {
      // Browsers always send Origin on WebSocket upgrades; non-browser clients (tests) send none.
      if (!originAllowed(env, origin) && origin !== null) return json({ error: 'Origin not allowed' }, 403);
      const parsed = RoomCodeSchema.safeParse(ws[1]!.toUpperCase());
      if (!parsed.success) return json({ error: 'Invalid room code' }, 400);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(parsed.data));
      return stub.fetch(request);
    }
    if (url.pathname.startsWith('/ws/')) return json({ error: 'Not found' }, 404);

    // Optional: the Worker can also serve the SPA (single-origin deploy). With the frontend on
    // Vercel this branch only answers direct visits to the Worker URL.
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return json({ error: 'Not found' }, 404);
  },
};
