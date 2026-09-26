# cardhub

A multi-game card platform: play locally (pass-and-play or against bots) or online with friends
by room code. Web first; Android and iOS later via Capacitor.

**Live:** https://cardhub-aaq.pages.dev

Games: **Uno** (with house rules: stacking, 7-0, jump-in, draw until playable). Monopoly Deal
and Chess are coming.

## Stack

| Part              | Tech                                                         |
| ----------------- | ------------------------------------------------------------ |
| `packages/engine` | Pure TypeScript game rules, shared by every other part       |
| `packages/bots`   | Computer opponents that see only their own player view       |
| `packages/shared` | Display text and the online message protocol                 |
| `apps/web`        | Vite + React + Tailwind + Zustand                            |
| `apps/server`     | Colyseus game server (rooms, codes, server-side rule checks) |
| `supabase/`       | Accounts (guest → email) and database migrations with RLS    |
| `e2e/`            | Playwright tests that drive the real app in a browser        |

## Getting started

Requires Node 24 (`nvm use`), pnpm 10 and Docker (for local Supabase).

```bash
nvm use
pnpm install
pnpm db:start   # local Supabase in Docker (first run downloads images)
pnpm db:env     # writes apps/web/.env.local and apps/server/.env.local
pnpm dev        # web on http://localhost:5173, game server on :2567
```

Without Supabase the web app still runs offline (local games only), and the game server runs
in dev mode without sign-in.

## Tests

```bash
pnpm test       # engine, bots, web components and game server (Vitest)
pnpm test:e2e   # full browser tests on desktop and mobile (needs `pnpm db:start`)
pnpm lint && pnpm typecheck && pnpm format:check
```

CI runs all of the above on every push and pull request (`.github/workflows/ci.yml`). Pushes to
`main` that pass every test are deployed (website to Cloudflare Pages, game server to Render),
then smoke-tested on the live site. The smoke tests also run daily (`.github/workflows/smoke.yml`).

## Useful commands

| Command         | What it does                                   |
| --------------- | ---------------------------------------------- |
| `pnpm db:stop`  | Stop local Supabase                            |
| `pnpm db:reset` | Rebuild the local database from the migrations |
| `pnpm build`    | Production build of the web app                |
