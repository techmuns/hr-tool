-- Server-issued session tokens for the base (employee) identity.
--
-- Before this, the base identity was a plain `x-user-id` header the client set
-- from a localStorage object. Anyone could edit that number (or just send a
-- different header) and be treated as another employee — see the security note
-- in src/worker/auth.ts. This table backs opaque, server-verified session
-- tokens instead: the client only ever holds a random string, and the server
-- resolves the real employee by looking that string up here. Editing it can't
-- forge another identity; it just fails to match and falls back to login.
--
-- Same design as admin_sessions (0032_admin_auth.sql): token_hash stores
-- SHA-256(raw token), never the token itself, so a read of this table (backup,
-- D1 console) can't be replayed as a live session.
--
-- IF NOT EXISTS everywhere so this heals a half-applied state: the CI build
-- (scripts/ci-migrate.sh) re-runs `d1 migrations apply` on every deploy, and if
-- an earlier attempt created the table but died before D1 recorded the
-- migration as applied, a plain CREATE TABLE would fail ("already exists") and
-- wedge every future deploy. The table carries no data until this ships, so
-- reusing an existing one is safe.
CREATE TABLE IF NOT EXISTS employee_sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash    TEXT NOT NULL UNIQUE,
  employee_id   INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_employee_sessions_employee ON employee_sessions(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_sessions_expires ON employee_sessions(expires_at);
