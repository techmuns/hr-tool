PRAGMA foreign_keys = ON;

CREATE TABLE employees (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  location          TEXT NOT NULL DEFAULT '',
  work_mode         TEXT NOT NULL DEFAULT 'in-office'
                    CHECK (work_mode IN ('wfh','in-office')),
  date_of_joining   TEXT NOT NULL,
  role              TEXT NOT NULL DEFAULT 'employee'
                    CHECK (role IN ('employee','admin')),
  monthly_salary    INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE attendance (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id   INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date     TEXT NOT NULL,
  clock_in      TEXT,
  clock_out     TEXT,
  status        TEXT NOT NULL DEFAULT 'present'
                CHECK (status IN ('present','absent','leave')),
  UNIQUE (employee_id, work_date)
);
CREATE INDEX idx_attendance_emp_date ON attendance(employee_id, work_date);

CREATE TABLE leave_requests (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id   INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  start_date    TEXT NOT NULL,
  end_date      TEXT NOT NULL,
  leave_type    TEXT NOT NULL DEFAULT 'paid'
                CHECK (leave_type IN ('paid','unpaid')),
  reason        TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_leave_emp ON leave_requests(employee_id);

CREATE TABLE feedback (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id   INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  message       TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE chat_messages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id   INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  sender_role   TEXT NOT NULL CHECK (sender_role IN ('employee','admin')),
  body          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_chat_emp ON chat_messages(employee_id, created_at);

CREATE TABLE payroll (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id    INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  period         TEXT NOT NULL,
  base_salary    INTEGER NOT NULL DEFAULT 0,
  paid_days      INTEGER NOT NULL DEFAULT 0,
  unpaid_days    INTEGER NOT NULL DEFAULT 0,
  deductions     INTEGER NOT NULL DEFAULT 0,
  net_pay        INTEGER NOT NULL DEFAULT 0,
  generated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (employee_id, period)
);
