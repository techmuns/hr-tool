-- Password-backed admin sessions for privileged (role = 'admin') employees.
--
-- Kept as separate tables rather than columns on `employees` on purpose: almost
-- every route in this app does `SELECT * FROM employees` and hands the row
-- straight to `c.json(...)`. Adding a password_hash column there would mean
-- auditing every one of those call sites to strip it back out, and a single
-- missed spot would leak a password hash to the browser. Keeping credentials
-- and sessions in their own tables makes that class of bug structurally
-- impossible instead of relying on remembering to exclude a column.

CREATE TABLE employee_credentials (
  employee_id    INTEGER PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  password_hash  TEXT NOT NULL,
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- token_hash stores SHA-256(raw session token), never the token itself, so a
-- read of this table (backup, D1 console, etc.) can't be replayed as a live
-- session — same reasoning as never storing the password itself.
CREATE TABLE admin_sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash    TEXT NOT NULL UNIQUE,
  employee_id   INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL
);
CREATE INDEX idx_admin_sessions_employee ON admin_sessions(employee_id);
CREATE INDEX idx_admin_sessions_expires ON admin_sessions(expires_at);
