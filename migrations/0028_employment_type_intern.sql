-- Allow 'intern' as a third employment type, alongside 'employee' and
-- 'freelancer'.
--
-- employment_type carries a CHECK constraint (from the 0017 rebuild) and SQLite
-- cannot alter a CHECK in place, so the employees table must be rebuilt — the
-- same procedure as 0017. DROP TABLE employees fires the ON DELETE actions of
-- every table that references employees(id): CASCADE empties attendance,
-- leave_requests, payroll, reimbursements, chat_messages, feedback and
-- deductions; SET NULL blanks the employee_id/created_by on certificates. So
-- every one of those tables is copied into a plain, unconstrained _bk_ table
-- first (which the cascade cannot touch), then restored afterwards with the
-- employee ids preserved, so no rows and no foreign-key links are lost.
CREATE TABLE _bk_attendance     AS SELECT * FROM attendance;
CREATE TABLE _bk_leave_requests AS SELECT * FROM leave_requests;
CREATE TABLE _bk_payroll        AS SELECT * FROM payroll;
CREATE TABLE _bk_reimbursements AS SELECT * FROM reimbursements;
CREATE TABLE _bk_chat_messages  AS SELECT * FROM chat_messages;
CREATE TABLE _bk_feedback       AS SELECT * FROM feedback;
CREATE TABLE _bk_deductions     AS SELECT * FROM deductions;
CREATE TABLE _bk_certificates   AS SELECT * FROM certificates;

-- Columns listed explicitly (not SELECT *) so a later-added column can't shift
-- the copy. This mirrors the live schema as of 0027 (the two reminder columns).
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
                    CHECK (employment_type IN ('employee','freelancer','intern')),
  on_payroll        INTEGER NOT NULL DEFAULT 1
                    CHECK (on_payroll IN (0, 1)),
  on_attendance     INTEGER NOT NULL DEFAULT 1
                    CHECK (on_attendance IN (0, 1)),
  last_attendance_reminder_at   TEXT,
  last_attendance_reminder_kind TEXT
                    CHECK (last_attendance_reminder_kind IN ('auto','manual'))
);

INSERT INTO employees_rebuild (
  id, name, location, work_mode, date_of_joining, role, monthly_salary, created_at,
  email, team_id, job_title, tier, employment_type, on_payroll, on_attendance,
  last_attendance_reminder_at, last_attendance_reminder_kind
)
SELECT
  id, name, location, work_mode, date_of_joining, role, monthly_salary, created_at,
  email, team_id, job_title, tier, employment_type, on_payroll, on_attendance,
  last_attendance_reminder_at, last_attendance_reminder_kind
FROM employees;

DROP TABLE employees;
ALTER TABLE employees_rebuild RENAME TO employees;

-- Restore the CASCADE children (emptied by the drop) — same column order as the
-- backups, which were made with SELECT * off the live tables.
INSERT INTO attendance     SELECT * FROM _bk_attendance;
INSERT INTO leave_requests SELECT * FROM _bk_leave_requests;
INSERT INTO payroll        SELECT * FROM _bk_payroll;
INSERT INTO reimbursements SELECT * FROM _bk_reimbursements;
INSERT INTO chat_messages  SELECT * FROM _bk_chat_messages;
INSERT INTO feedback       SELECT * FROM _bk_feedback;
INSERT INTO deductions     SELECT * FROM _bk_deductions;

-- certificates rows survived (SET NULL, not CASCADE) but with their employee_id
-- and created_by blanked, so replace them with the backed-up rows to restore
-- those links.
DELETE FROM certificates;
INSERT INTO certificates SELECT * FROM _bk_certificates;

DROP TABLE _bk_attendance;
DROP TABLE _bk_leave_requests;
DROP TABLE _bk_payroll;
DROP TABLE _bk_reimbursements;
DROP TABLE _bk_chat_messages;
DROP TABLE _bk_feedback;
DROP TABLE _bk_deductions;
DROP TABLE _bk_certificates;
