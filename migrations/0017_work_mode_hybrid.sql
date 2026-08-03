-- Allow 'hybrid' as a third work mode, alongside 'wfh' and 'in-office'.
--
-- work_mode carries a CHECK constraint from 0001 and SQLite cannot alter a CHECK
-- in place, so the table has to be rebuilt. That is the whole difficulty here:
-- six tables reference employees(id) ON DELETE CASCADE, and DROP TABLE performs
-- an implicit DELETE that fires those cascades — it empties attendance,
-- leave_requests, payroll, reimbursements, chat_messages and feedback.
--
-- Neither `PRAGMA defer_foreign_keys` nor `PRAGMA foreign_keys = OFF` prevents
-- this on D1; both were tried and both still lost every child row. So the child
-- rows are copied into plain unconstrained tables first, which the cascade
-- cannot touch, and put back afterwards. The child tables keep their own
-- schemas throughout — only their rows make the round trip — and they go on
-- referencing "employees" by name, which exists again after the rename.
CREATE TABLE _bk_attendance     AS SELECT * FROM attendance;
CREATE TABLE _bk_leave_requests AS SELECT * FROM leave_requests;
CREATE TABLE _bk_payroll        AS SELECT * FROM payroll;
CREATE TABLE _bk_reimbursements AS SELECT * FROM reimbursements;
CREATE TABLE _bk_chat_messages  AS SELECT * FROM chat_messages;
CREATE TABLE _bk_feedback       AS SELECT * FROM feedback;

-- Columns are listed explicitly rather than relying on SELECT *, so a column
-- added in a different position later can't silently shift the copy.
CREATE TABLE employees_rebuild (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  location          TEXT NOT NULL DEFAULT '',
  work_mode         TEXT NOT NULL DEFAULT 'in-office'
                    CHECK (work_mode IN ('wfh','in-office','hybrid')),
  date_of_joining   TEXT NOT NULL,
  role              TEXT NOT NULL DEFAULT 'employee'
                    CHECK (role IN ('employee','admin')),
  monthly_salary    INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  email             TEXT NOT NULL DEFAULT '',
  team_id           INTEGER REFERENCES teams(id),
  job_title         TEXT NOT NULL DEFAULT '',
  tier              TEXT NOT NULL DEFAULT 'employee'
                    CHECK (tier IN ('employee','hr','founder')),
  employment_type   TEXT NOT NULL DEFAULT 'employee'
                    CHECK (employment_type IN ('employee','freelancer')),
  on_payroll        INTEGER NOT NULL DEFAULT 1
                    CHECK (on_payroll IN (0, 1)),
  on_attendance     INTEGER NOT NULL DEFAULT 1
                    CHECK (on_attendance IN (0, 1))
);

INSERT INTO employees_rebuild (
  id, name, location, work_mode, date_of_joining, role, monthly_salary, created_at,
  email, team_id, job_title, tier, employment_type, on_payroll, on_attendance
)
SELECT
  id, name, location, work_mode, date_of_joining, role, monthly_salary, created_at,
  email, team_id, job_title, tier, employment_type, on_payroll, on_attendance
FROM employees;

DROP TABLE employees;
ALTER TABLE employees_rebuild RENAME TO employees;

-- Put the children back. Same column order as the backups, which were made with
-- SELECT * off the live tables, so the positional insert lines up.
INSERT INTO attendance     SELECT * FROM _bk_attendance;
INSERT INTO leave_requests SELECT * FROM _bk_leave_requests;
INSERT INTO payroll        SELECT * FROM _bk_payroll;
INSERT INTO reimbursements SELECT * FROM _bk_reimbursements;
INSERT INTO chat_messages  SELECT * FROM _bk_chat_messages;
INSERT INTO feedback       SELECT * FROM _bk_feedback;

DROP TABLE _bk_attendance;
DROP TABLE _bk_leave_requests;
DROP TABLE _bk_payroll;
DROP TABLE _bk_reimbursements;
DROP TABLE _bk_chat_messages;
DROP TABLE _bk_feedback;
