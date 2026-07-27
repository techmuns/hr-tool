# HR Tool

Two-sided HR dashboard (employee + admin/HR) on Cloudflare Workers, with Hono for
the API and D1 for storage. React/Vite SPA served via the Workers static assets
binding.

## Authentication

Every `/api/*` request is authenticated by a **verified bearer token** sent as
`Authorization: Bearer <token>`. There are two supported credentials, both
resolved to an employee (and therefore role/tier) *from the database* — the
client never asserts its own identity or role:

- **Munshot host JWT** (embedded web dashboard) — the host passes a JWT via the
  dashboard SDK. The Worker verifies its signature and claims and maps the
  verified `email` claim to an employee.
- **App-session token** (email OTP — used by the Chrome extension and as a web
  fallback) — after `POST /api/auth/request-otp` + `/api/auth/verify-otp`, the
  Worker mints a short-lived HS256 token signed with `SESSION_SECRET`.

### Required secrets

```bash
wrangler secret put MUNS_TOKEN        # Muns raw email API (OTP delivery)
wrangler secret put SESSION_SECRET    # signs app-session tokens

# Munshot host JWT verification — configure ONE of:
wrangler secret put MUNSHOT_JWKS_URL       # JWKS endpoint (preferred)
#   or MUNSHOT_JWT_PUBLIC_KEY (PEM) [+ MUNSHOT_JWT_ALG], or MUNSHOT_JWT_SECRET (HS256)
# optional claim checks: MUNSHOT_JWT_ISSUER, MUNSHOT_JWT_AUDIENCE
```

Optional vars: `ALLOWED_ORIGINS` (comma-separated origins permitted to call the
API cross-site), `FRAME_ANCESTORS` (CSP framing allow-list for the Munshot host),
and the build-time `VITE_MUNSHOT_ORIGINS` (pins the SDK message channel origin).
For local dev put these in `.dev.vars` (gitignored).

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
