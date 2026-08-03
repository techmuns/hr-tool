-- Rebuild email_otps.
--
-- The deployed database has an email_otps table with no `code` column, so
-- POST /api/auth/request-otp dies with "table email_otps has no column named
-- code" and OTP login is unusable. 0009 has declared `code` since the day it was
-- written and has never been edited, so whatever is deployed did not come from
-- it — most likely the table already existed when 0009 ran, its CREATE TABLE
-- failed, and scripts/ci-migrate.sh swallowed the error so the deploy carried on.
--
-- Rows here are disposable by design: single-use codes that expire in ten
-- minutes. So the honest fix is to drop and recreate, rather than ALTER in one
-- missing column and hope the rest of the shape matches. The only cost is that
-- anyone holding an unused code needs to request a fresh one.
DROP TABLE IF EXISTS email_otps;

CREATE TABLE email_otps (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL,
  code       TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- DROP TABLE takes its indexes with it; IF NOT EXISTS covers a partial state.
CREATE INDEX IF NOT EXISTS idx_email_otps_email ON email_otps (email);
