-- Whether an employee appears in the admin attendance list. Lets HR remove
-- people from attendance tracking without deleting them or their records.
ALTER TABLE employees ADD COLUMN on_attendance INTEGER NOT NULL DEFAULT 1
  CHECK (on_attendance IN (0, 1));
