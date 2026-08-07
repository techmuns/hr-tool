-- Reimbursements now need HR sign-off before they can reach a payslip.
--
-- Until now POST /reimbursements wrote a row that the next payroll generation
-- summed straight into net pay, so an employee could raise their own pay
-- unilaterally by filing a request. `status` is the gate: only 'approved' rows
-- count towards a cycle, and HR decides in the Adjustments tab.
--
-- Every pre-existing row becomes 'pending'. That is the intent of the DEFAULT
-- here, not a side effect of ALTER TABLE: those rows were auto-approved by the
-- old code path and have never actually been reviewed by anyone, so they go
-- back through the new queue like everything else. Payroll that was already
-- generated keeps the amounts it was generated with — only a re-generate
-- re-reads these rows — so this does not silently rewrite a paid cycle.
ALTER TABLE reimbursements ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending','approved','rejected'));
ALTER TABLE reimbursements ADD COLUMN decided_at TEXT;
ALTER TABLE reimbursements ADD COLUMN decided_by INTEGER REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE reimbursements ADD COLUMN decision_note TEXT NOT NULL DEFAULT '';

-- Stated explicitly so the reset does not depend on the reader knowing what the
-- DEFAULT above does to rows that already exist.
UPDATE reimbursements SET status = 'pending';

-- The approval queue reads "everything still pending, oldest first", which is
-- this index exactly.
CREATE INDEX idx_reimbursements_status ON reimbursements(status, created_at);
