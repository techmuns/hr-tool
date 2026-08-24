-- The 50%/100% decision moves from the breakup to the individual LINE: an
-- admin can now reimburse 10/08 in full while the rest of the cycle stays at
-- half. The per-line flag lives in the `entries` JSON (no column for it), so
-- what payroll needs is the already-summed payout — kept here so payroll math
-- still never has to parse that JSON, same reason `total` is stored.
--
-- `total` keeps meaning the raw amount HR logged; `reimbursed_total` is what
-- payroll actually pays out of it.
ALTER TABLE reimbursement_breakups ADD COLUMN reimbursed_total INTEGER NOT NULL DEFAULT 0;

-- Existing rows predate per-line flags: every line of one was covered by that
-- row's single full_reimbursement switch, so its value is what each line meant.
-- Their entries stay flagless until the next save, and the read path treats a
-- missing flag as the row's full_reimbursement for exactly this reason.
UPDATE reimbursement_breakups
   SET reimbursed_total = CASE
     WHEN full_reimbursement = 1 THEN total
     ELSE CAST(ROUND(total / 2.0) AS INTEGER)
   END;
