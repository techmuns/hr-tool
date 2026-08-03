#!/bin/sh
# Apply D1 migrations to the REMOTE database, but only inside Cloudflare's
# build pipeline (which has ambient API auth). Locally — during `wrangler dev`
# or a plain `wrangler deploy` without a token — this is skipped so it never
# breaks local development. Migrations are idempotent, so re-running per build
# is safe.
#
# A failure here is FATAL, on purpose. This used to warn and carry on, which
# shipped a Worker against a schema that had not migrated: a failed
# 0009_email_otps left the table without its `code` column, and OTP login
# returned 500 for everyone until someone went looking. Deploying code that
# expects a schema you failed to create is worse than not deploying at all, so
# stop here and let the build go red where it can be seen.
set -e

if [ -n "$WORKERS_CI" ] || [ -n "$CF_PAGES" ] || [ "$CI" = "true" ]; then
  echo "CI detected — applying remote D1 migrations for hr-tool-db"
  npx wrangler d1 migrations apply hr-tool-db --remote
  echo "Remote D1 migrations applied."
else
  echo "Local build — skipping remote D1 migrations"
fi
