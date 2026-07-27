-- Harden the email OTP store: hash codes at rest (never store plaintext codes)
-- and track failed attempts so a code can be locked out after too many guesses.
-- OTP rows are ephemeral (10-minute TTL), so recreating the table is safe.
DROP TABLE IF EXISTS email_otps;

CREATE TABLE email_otps (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL,
  code_hash  TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_email_otps_email ON email_otps (email);
