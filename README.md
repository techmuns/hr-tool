# HR Tool

Two-sided HR dashboard (employee + admin/HR) on Cloudflare Workers, with Hono for
the API and D1 for storage. React/Vite SPA served via the Workers static assets
binding.

## Login

Single text box on `/`. Typing `admin` signs in as HR; typing `employee` signs in
as a sample employee; typing an email address looks that employee up directly
(the same lookup the Munshot host relay uses). Standalone visitors instead get
an email OTP (`POST /api/auth/request-otp` → `POST /api/auth/verify-otp`).

**Every one of those ends the same way**: the server issues a random,
unguessable session token (hashed and stored in `employee_sessions`, never in
plaintext — see `src/worker/employeeSession.ts`) and sets it as the `hr_session`
HttpOnly cookie. Every request after that is identified by re-checking that
cookie against the database, never by anything the client merely claims —
this replaced an earlier `x-user-id` / `x-role` header pair that the client set
from its own `localStorage`, which meant editing devtools/localStorage was
enough to become a different employee outright. `role`/`tier` (and therefore
HR/founder capability) now come straight from that verified session — there's
no client-supplied value left to double-check against, so admin access needs
nothing beyond a normal login.

The Chrome extension (`extension/`) is a second client of the same mechanism:
`POST /api/auth/verify-otp` also returns the raw token in its response body,
which the extension stores itself and replays as `Authorization: Bearer
<token>` (it can't rely on the browser's cookie jar the way a same-origin page
can). `requireEmployee` (`src/worker/auth.ts`) accepts either the cookie or
the bearer header, checked against the same table.

Because the session cookie is `Secure`, it only works over HTTPS —
`npm run dev:worker` (`wrangler dev`) needs `--local-protocol https` to log in
at all locally; the deployed Worker is HTTPS-only already, so this only
matters for local dev.

There's also a **separate, currently-unused** password-gated admin session
(`src/worker/adminSession.ts`, `POST /api/auth/admin-login` /
`/api/auth/admin-password/set`) left over from an earlier design where
HR/founder access needed a second password on top of the base login. Nothing
in the app calls it today — the routes and `admin_sessions`/
`employee_credentials` tables just sit dormant.

### Embedding (Munshot iframe)

When loaded inside the Munshot host's iframe, the base identity (including the
session JWT) comes from a `postMessage` the host sends rather than the OTP
form (see `src/web/lib/sdk.ts`, `src/web/hooks/useHostContext.ts`). Only
messages from an allow-listed origin are trusted — set
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

**Framing is locked down too.** Every response (API and static assets alike)
carries `Content-Security-Policy: frame-ancestors https://chat.muns.io` (see
`src/worker/security.ts`), so no site other than the real Munshot host can
embed this app in an iframe at all — closing off clickjacking/UI-redress
against the framing itself, on top of the postMessage origin check above.
Keep `FRAME_ANCESTORS` there in sync with `DEFAULT_ALLOWED_HOST_ORIGINS` in
`sdk.ts`.

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
