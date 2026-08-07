-- Grant Nadam HR access.
--
-- Access level lives in two columns that have to move together: `tier` is what
-- the UI reads to decide which dashboard and tabs to show, `role` is what
-- requireAdmin checks on every admin request. The founder-only
-- PATCH /employees/:id/tier endpoint writes both; this does the same by hand.
--
-- Matched on name rather than id: ids differ between the local seed and the
-- deployed database, so a hard-coded id would promote the wrong person (or
-- nobody) depending on where the migration runs. The tier guard keeps a founder
-- from being demoted to HR if their name happens to match, and re-running the
-- migration is a no-op.
UPDATE employees
   SET tier = 'hr',
       role = 'admin'
 WHERE lower(name) LIKE '%nadam%'
   AND tier <> 'founder';
