-- Per-line reimbursement percentage, and reimbursements that ADD instead of
-- override.
--
-- Two things changed in the business rules, both additive so no existing data
-- is lost or rewritten (the old `total` and `full_reimbursement` columns stay
-- exactly as they were):
--
-- 1. The 50% / 100% choice is now PER LINE, not per cycle. Each entry in the
--    `entries` JSON now carries its own `percent` (50 or 100); an entry with no
--    `percent` (every row written before this migration) is read as the cycle's
--    old `full_reimbursement` flag said — 100 when it was on, 50 when off — so a
--    breakup logged last month still pays out the same until HR edits it.
--
-- 2. Payroll now needs the already-percentaged figure without re-parsing the
--    JSON (the whole reason `total` was stored next to it). `reimbursed_total`
--    is that number: the sum of each line's amount * its percent. syncPayroll
--    reads this column directly and ADDS it to approved reimbursement requests
--    (it used to pick one or the other), so HR's notepad and the approved-
--    request queue now stack instead of silently replacing each other.
--
-- `total` stays the GROSS logged sum; `reimbursed_total` is what reaches net
-- pay. `full_reimbursement` is kept (and still written, as "every line is
-- 100%") only so anything still reading the old column keeps working.
ALTER TABLE reimbursement_breakups ADD COLUMN reimbursed_total INTEGER NOT NULL DEFAULT 0;

-- Backfill the new column from the old per-cycle flag so already-logged cycles
-- keep the exact figure they were paying before this migration. Half is rounded
-- the same way the app did it (round half up on a positive paise amount).
UPDATE reimbursement_breakups
SET reimbursed_total = CASE
  WHEN full_reimbursement = 1 THEN total
  ELSE CAST(ROUND(total / 2.0) AS INTEGER)
END;
