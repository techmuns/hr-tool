-- Distinguish full employees from freelancers. Freelancers show in the employee
-- directory but are excluded from attendance tracking.
ALTER TABLE employees ADD COLUMN employment_type TEXT NOT NULL DEFAULT 'employee'
  CHECK (employment_type IN ('employee','freelancer'));
