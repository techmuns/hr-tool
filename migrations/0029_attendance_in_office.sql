-- Whether a present day was worked in-office (1) rather than remotely / WFH (0).
-- Only meaningful when status = 'present'. HR sets this from the attendance grid
-- ("In office"); the payroll tab totals it per cycle for in-office and hybrid
-- staff. A plain ADD COLUMN — no CHECK-rebuild needed.
ALTER TABLE attendance ADD COLUMN in_office INTEGER NOT NULL DEFAULT 0
  CHECK (in_office IN (0, 1));
