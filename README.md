# HR Tool

Two-sided HR dashboard (employee + admin/HR) on Cloudflare Workers, with Hono for
the API and D1 for storage. React/Vite SPA served via the Workers static assets
binding.

## Login

The dashboard is embedded in the Munshot host as an iframe and never runs its
own login screen. Identity comes from the host: the Munshot Dashboard SDK
delivers a session (JWT + email) via `host:init`/`host:context:update`, and
the app resolves the matching `employees` row by that email on every load —
see `src/web/App.tsx`. There are no passwords and no locally-typed
role/email shortcuts; an employee row must exist with a matching `email` for
sign-in to succeed. Because the app never persists the resolved identity
across page loads, it's always re-derived fresh from whatever host session is
currently active, so one person's browser can never keep showing a
previously-resolved different employee's data.

Running the SPA standalone outside the Munshot host (e.g. a bare
`npm run dev:worker` in a normal browser tab) has no host to supply a
session, so it will sit on "Waiting for session…" indefinitely — this app is
only fully usable embedded in Munshot.

## Setup

```bash
npm install

# create the D1 database (first time only), then paste the returned
# database_id into wrangler.jsonc
npm run db:create

# apply schema + seed data locally
npm run db:migrate:local

# build the frontend, then run the full stack (Worker + D1 + assets)
npm run build
npm run dev:worker
```

Open the printed `http://localhost:8787`.

## Deploy

```bash
npm run db:migrate:remote   # once, against the real D1 database
npm run deploy
```

## Scripts

- `npm run dev` — Vite only (frontend iteration, no API).
- `npm run dev:worker` — full stack via `wrangler dev` (Worker + D1 + assets).
- `npm run build` — builds the SPA into `dist/client`.
- `npm run deploy` — build + `wrangler deploy`.
- `npm run db:migrate:local` / `db:migrate:remote` — apply D1 migrations.
- `npm run db:seed:local` — re-run the seed script against the local D1 store.
