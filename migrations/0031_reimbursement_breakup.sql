-- HR's manual daily reimbursement breakup for one employee in one pay cycle: a
-- notepad of labelled lines (stored as JSON) plus their summed total, in paise.
-- The payroll tab reimburses HALF of this total (business rule), and shows the
-- breakup in a dropdown. One row per (employee, period); HR overwrites it.
-- `total` is stored alongside the JSON so payroll math never has to parse it.
CREATE TABLE reimbursement_breakups (
  employee_id  INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  period       TEXT NOT NULL,               -- "YYYY-MM", the cycle it's paid in
  entries      TEXT NOT NULL DEFAULT '[]',  -- JSON: [{ "label": "...", "amount": <paise> }]
  total        INTEGER NOT NULL DEFAULT 0,  -- sum of entry amounts, in paise
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by   INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  PRIMARY KEY (employee_id, period)
);
