# HR Tool

Two-sided HR dashboard (employee + admin/HR) on Cloudflare Workers, with Hono for
the API and D1 for storage. React/Vite SPA served via the Workers static assets
binding.

## Login

Standalone, sign-in is by email one-time code (`/` → email → 6-digit code).

**Base identity is a server-issued session token.** A successful login (OTP
verify, or the host relay below) returns an opaque, random token; the server
stores only its SHA-256 (`employee_sessions` table) and hands the raw token to
the client, which keeps it in `localStorage` and replays it as
`Authorization: Bearer <token>` on every request. The server resolves the real
employee — id, role, and tier — by looking that token up on each request
(`requireEmployee` in `src/worker/auth.ts`), so the client never asserts its
own identity. This replaced an earlier scheme where the client sent its own
`x-user-id` / `x-role` headers from a plaintext `localStorage` object: editing
that id (or sending any header) got you served as another employee. A token
can't be forged into someone else's identity — change a character and it simply
stops matching a stored session. `localStorage` now holds only the opaque token
(nothing readable, nothing tamperable); the id/role/tier the UI needs are
resolved from the server via `GET /api/auth/session` on load. See
`src/worker/employeeSession.ts`.

**Admin/HR access additionally requires a password.** A `role = 'admin'`
employee's base session unlocks nothing privileged by itself; they must also
authenticate with a password via `POST /api/auth/admin-login`, which issues a
short-lived (6h), HttpOnly, server-tracked session cookie (`admin_sessions`).
First-time setup: a privileged employee sets their own password via `POST
/api/auth/admin-password/set`, gated on their base (OTP/host) session so it
can only ever touch their own account. See `src/worker/adminSession.ts` and
`src/worker/routes/auth.ts` for the implementation.

Because the admin session cookie is `Secure`, it only works over HTTPS —
`npm run dev:worker` (`wrangler dev`) needs `--local-protocol https` to
exercise the admin-login flow locally; the deployed Worker is HTTPS-only
already, so this only matters for local dev.

### Embedding (Munshot iframe)

When loaded inside the Munshot host's iframe, the user's identity comes from a
`postMessage` the host sends rather than the OTP form: the host provides the
signed-in user's email, and the app exchanges it (`POST /api/login`) for a base
session token, same as above (see `src/web/lib/sdk.ts`,
`src/web/hooks/useHostContext.ts`, `src/web/App.tsx`). Only messages from an
allow-listed origin are trusted — set
`VITE_MUNSHOT_ALLOWED_ORIGINS` (comma-separated, see `.env.example`) at build
time to override the real muns.io origin(s); left unset, it falls back to the
`DEFAULT_ALLOWED_HOST_ORIGINS` hardcoded in `sdk.ts` (currently
`https://chat.muns.io`) rather than an empty list, so this never silently
degrades to "accept everything."

**No wildcards.** The vendor SDK matches origins with an exact `Set.has()` —
it drops anything else before this app's own code even runs, so a pattern
like `*.muns.io` would silently match nothing. If Munshot ever embeds this
app from another muns.io subdomain, add its exact origin to
`DEFAULT_ALLOWED_HOST_ORIGINS` in `sdk.ts` (or to
`VITE_MUNSHOT_ALLOWED_ORIGINS`, which takes precedence).

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
- `npm test` — runs the Worker test suite (`@cloudflare/vitest-pool-workers`, real D1 via Miniflare) plus frontend logic unit tests. Needs `npm run build` to have been run at least once (populates `dist/client`, which the Worker's static-assets binding requires to boot even in tests).
