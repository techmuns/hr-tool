-- Whether a present day was explicitly marked work-from-home by HR. Like
-- in_office, this is a MANUAL flag (HR sets it from the attendance grid); a
-- plain present day is neither in-office nor WFH. Mutually exclusive with
-- in_office (enforced in the write handler). The payroll WFH column counts only
-- days flagged here — nothing is inferred automatically.
ALTER TABLE attendance ADD COLUMN wfh INTEGER NOT NULL DEFAULT 0
  CHECK (wfh IN (0, 1));
