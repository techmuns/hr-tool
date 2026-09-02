-- Half-day: a present day where the employee only worked/attended half of it.
-- Same convention as in_office/wfh (0029/0032_attendance_wfh) — a MANUAL flag
-- HR sets from the attendance grid, only meaningful when status = 'present',
-- mutually exclusive with in_office/wfh (enforced in the write handler).
-- Deliberately NOT wired into payroll's pay math (see payrollCalc.ts):
-- attendance has never driven net pay, only approved unpaid leave and manual
-- deductions do, and this stays a pure attendance-tracking flag with no
-- payroll column — same as a plain present/absent day today.
ALTER TABLE attendance ADD COLUMN half_day INTEGER NOT NULL DEFAULT 0
  CHECK (half_day IN (0, 1));

-- National/festival holidays HR marks by hand. work_date is the primary key
-- (not an autoincrement id) since a calendar date can only ever be one
-- holiday, which makes "add or rename" a plain upsert.
CREATE TABLE holidays (
  work_date   TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  created_by  INTEGER REFERENCES employees(id) ON DELETE SET NULL
);
