# Gambit

A Codenames-style word-deduction party game for two teams, plus a small deck of ability cards
that operatives draw and play during their turn. Server-authoritative, serverless on Cloudflare
Workers with one Durable Object per room.

Full design and roadmap: `~/.claude/plans/users-pratham-gupta-desktop-codename-yu-fluffy-naur.md`.

## Layout

```
packages/protocol   Zod schemas + types shared by everything (commands, events, client views)
packages/engine     Pure, deterministic rules engine: board, turns, cards, projections. No IO.
apps/server         Cloudflare Worker + RoomDurableObject; RoomCore holds all room behaviour
apps/web            Vite + React 19 + Tailwind v4 + Motion, feature-based folders
scripts/preflight   Mechanical UI-skill checks (dashes, emojis, fonts, engine leaks)
```

Dependency direction: `web -> protocol` only. `server -> engine, protocol`. `engine -> protocol`.
ESLint enforces the feature boundaries and forbids importing the engine from the web app.

## Run locally

Requires Node 22.12+ (`nvm use 22.22.3`). No Cloudflare account needed.

```bash
npm install
npm run dev
```

Open http://localhost:5173. The local room server (same `RoomCore` as the Durable Object, in
memory) runs on :8787 and the Vite dev server proxies `/api` and `/ws` to it. Open several tabs
to play as several people: sessions are stored per tab.

## Check

```bash
npm run check        # typecheck + lint + unit tests + pre-flight
npm run test         # protocol, engine, server unit tests (vitest)
npm run test:workers # Durable Object integration tests inside workerd
npm run e2e          # Playwright, needs `npm run dev` running and `npx playwright install chromium`
```

## Run the real Worker locally

```bash
npm run build && npm run dev:cf -w @gambit/server   # http://localhost:8787, SPA + Durable Objects in workerd
```

## Deploy (Cloudflare)

See `apps/server/README.md`. `npx wrangler login` once, then `npm run deploy` (builds the SPA and
deploys the Worker with static assets and the SQLite-backed Durable Object).

## Rules in one breath

5x5 words, 9/8/7/1 key, spymaster gives one word and a number, operatives guess up to number+1.
Each team has a 24-card deck built from the enabled pool, an opening hand of 2, one automatic
draw at turn start (skipped at hand size 4), and may play at most one card per turn, only after
the clue. Information cards cost a guess and answer privately to the team; every play is
announced publicly by name and target. Extra guesses cap at +2 per turn. The assassin still ends
the game.
