ALTER TABLE employees ADD COLUMN tier TEXT NOT NULL DEFAULT 'employee'
  CHECK (tier IN ('employee','hr','founder'));

-- Whoever already holds the admin role becomes founder, so there's always
-- someone who can assign HR from day one.
UPDATE employees SET tier = 'founder' WHERE role = 'admin';
