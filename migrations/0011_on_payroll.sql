-- Whether an employee is included in payroll generation. Lets HR remove people
-- (e.g. freelancers paid elsewhere) from payroll without deleting them.
ALTER TABLE employees ADD COLUMN on_payroll INTEGER NOT NULL DEFAULT 1
  CHECK (on_payroll IN (0, 1));
