#!/bin/sh
# Apply D1 migrations to the REMOTE database, but only inside Cloudflare's
# build pipeline (which has ambient API auth). Locally — during `wrangler dev`
# or a plain `wrangler deploy` without a token — this is skipped so it never
# breaks local development. Migrations are idempotent, so re-running per build
# is safe. Non-fatal: a failure here won't block the Worker from deploying.
if [ -n "$WORKERS_CI" ] || [ -n "$CF_PAGES" ] || [ "$CI" = "true" ]; then
  echo "CI detected — applying remote D1 migrations for hr-tool-db"
  npx wrangler d1 migrations apply hr-tool-db --remote || \
    echo "WARN: remote D1 migration failed; deploy will continue"
else
  echo "Local build — skipping remote D1 migrations"
fi
