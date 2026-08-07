-- Manual deductions HR books against a cycle — salary advances, equipment
-- damage, a shortfall to claw back — plus the payslip breakdown needed to show
-- them apart from leave.
CREATE TABLE deductions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  -- The cycle this hits, as a payroll period ("YYYY-MM"). Pinned explicitly
  -- instead of being derived from created_at the way reimbursements are: a
  -- reimbursement is dated by when the expense was filed, but a manual
  -- deduction is booked against whichever cycle HR is looking at, which is not
  -- always the one today happens to fall in.
  period      TEXT NOT NULL,
  amount      INTEGER NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  created_by  INTEGER REFERENCES employees(id) ON DELETE SET NULL
);
CREATE INDEX idx_deductions_period ON deductions(period, employee_id);

-- payroll.deductions stays the single total that nets off the salary; these two
-- record what it is made of, so a payslip can list unpaid leave and manual
-- deductions as separate lines instead of one unexplained number.
ALTER TABLE payroll ADD COLUMN leave_deductions INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payroll ADD COLUMN other_deductions INTEGER NOT NULL DEFAULT 0;

-- Manual deductions did not exist before this migration, so every deduction on
-- an already-generated row could only ever have come from unpaid leave.
UPDATE payroll SET leave_deductions = deductions;
