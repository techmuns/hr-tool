-- Per-line reimbursement rate. HR's daily breakup used to have ONE 100%/50%
-- switch for the whole notepad (`full_reimbursement`); now each logged line is
-- reimbursed at 100% or 50% individually, chosen per line by HR. The per-line
-- rate lives in the `entries` JSON as a `full` boolean (true = 100%, false =
-- 50%); a line without it falls back to the row's `full_reimbursement` so old
-- breakups keep their behaviour until HR next edits them.
--
-- We store the already-computed reimbursed total (paise) in a new column so the
-- payroll math never has to parse the JSON — same rule the original
-- `reimbursement_breakups.total` comment set out.
ALTER TABLE reimbursement_breakups ADD COLUMN reimbursed INTEGER NOT NULL DEFAULT 0;

-- Backfill from the old cycle-wide flag: full → the whole total, otherwise half.
-- (total + 1) / 2 is integer division that rounds the odd paise up, matching the
-- app's Math.round(total / 2).
UPDATE reimbursement_breakups
   SET reimbursed = CASE WHEN full_reimbursement = 1 THEN total ELSE (total + 1) / 2 END;
