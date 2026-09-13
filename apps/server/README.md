# @gambit/server

Serverless backend: one Cloudflare Worker plus one Durable Object per room.

- `src/worker.ts` - fetch entry: serves the built SPA, `POST /api/rooms`, `GET /ws/:code`.
- `src/room/RoomDurableObject.ts` - WebSocket Hibernation adapter and alarm host.
- `src/room/RoomCore.ts` - all room behaviour, transport-agnostic and unit-tested in Node.
- `dev/local.ts` - local Node server running the same RoomCore over `ws` with in-memory storage.

## Run

```bash
npm run dev                # repo root: Node room server on :8787 + Vite on :5173 (fast iteration)
npm run build && npm run dev:cf -w @gambit/server
                           # the real Worker + Durable Objects in workerd on :8787, serving apps/web/dist
```

## Test

```bash
npm test                       # repo root: protocol, engine, server unit tests (vitest 5)
npm run test:workers           # Durable Object integration tests inside workerd (vitest 4 + pool 0.22)
npm run typecheck -w @gambit/server
```

The Workers pool pins vitest 4, so `vitest@4` is nested in this workspace only; the root keeps
vitest 5. `vitest.config.ts` (unit) and `vitest.workers.config.ts` (workerd) are separate.

## Deploy

```bash
npx wrangler login
npm run deploy             # repo root: builds the SPA, deploys the Worker with static assets
```

`wrangler.toml` declares the `ROOMS` Durable Object binding as a SQLite-backed class (free plan
compatible), the `nodejs_compat` flag, and the assets directory `../web/dist` with SPA fallback.
`npm run deploy:dry -w @gambit/server` validates the bundle without an account.
