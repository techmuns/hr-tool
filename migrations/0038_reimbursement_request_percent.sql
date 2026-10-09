-- Per-request reimbursement percentage.
--
-- Until now an approved reimbursement request was always paid in full. HR now
-- wants the same per-line 50% / 100% control the daily breakup has, on each
-- individual request (approved or not). `percent` is that share.
--
-- Default 100 so every existing and future request keeps paying in full unless
-- HR explicitly drops a specific one to 50% — nothing already approved changes
-- amount. Additive column, safe on a database that already carries the daily
-- breakup's own per-line percents.
ALTER TABLE reimbursements ADD COLUMN percent INTEGER NOT NULL DEFAULT 100
  CHECK (percent IN (50, 100));
