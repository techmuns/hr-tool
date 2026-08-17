-- Server-issued, unguessable session token for the BASE employee identity —
-- every role (admin, employee, member) — replacing the x-user-id / x-role
-- headers requireEmployee used to trust verbatim. Those were plain
-- client-supplied values with zero server-side verification: editable via
-- devtools (web, localStorage) or chrome.storage (the browser extension) to
-- become anyone. This table is established only once identity is actually
-- verified — the postMessage email (locked to an allow-listed origin, see
-- hostMessageGuard.ts) or an email OTP the employee proved they received —
-- same shape as admin_sessions (0032_admin_auth.sql), generalized to every
-- employee rather than just role='admin'.
--
-- token_hash stores SHA-256(raw session token), never the token itself, so a
-- read of this table can't be replayed as a live session.
CREATE TABLE employee_sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash    TEXT NOT NULL UNIQUE,
  employee_id   INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL
);
CREATE INDEX idx_employee_sessions_employee ON employee_sessions(employee_id);
CREATE INDEX idx_employee_sessions_expires ON employee_sessions(expires_at);
