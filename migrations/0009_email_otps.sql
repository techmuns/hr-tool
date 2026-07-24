-- One-time codes emailed to verify a device (e.g. the Chrome extension) owns an
-- employee's email address before it can act on their behalf.
CREATE TABLE email_otps (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL,
  code       TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_email_otps_email ON email_otps (email);
