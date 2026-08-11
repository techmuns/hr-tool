-- Archive an employee: keep their record and all their data, but drop them out
-- of attendance, payroll and the active directory. A softer alternative to
-- deleting — the archived list stays reachable so their history can be pulled
-- up later, and restoring clears the flag. A plain ADD COLUMN, no rebuild.
ALTER TABLE employees ADD COLUMN archived INTEGER NOT NULL DEFAULT 0
  CHECK (archived IN (0, 1));
