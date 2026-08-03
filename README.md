# HR Tool

Two-sided HR dashboard (employee + admin/HR) on Cloudflare Workers, with Hono for
the API and D1 for storage. React/Vite SPA served via the Workers static assets
binding.

## Login

Single text box on `/`. Typing `admin` signs in as HR; typing `employee` signs in
as a sample employee. No passwords — identity is a demo-grade `x-user-id` /
`x-role` header pair stored in `localStorage`.

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

## Email (OTP login + payslips)

Outgoing mail goes through the Muns raw email API, authenticated with a
`MUNS_TOKEN` secret. It is read from the Workers environment and never
committed — without it, sends fail with a clear message instead of silently
doing nothing.

```bash
npx wrangler secret put MUNS_TOKEN     # production

echo 'MUNS_TOKEN=<token>' > .dev.vars  # local dev (.dev.vars is gitignored)
```

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
