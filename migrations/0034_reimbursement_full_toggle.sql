-- Lets HR reimburse a logged breakup in FULL (100%) instead of the standard
-- HALF (50%). Off by default so every existing and future breakup keeps
-- today's 50% behaviour unless someone explicitly opts a cycle in.
ALTER TABLE reimbursement_breakups ADD COLUMN full_reimbursement INTEGER NOT NULL DEFAULT 0
  CHECK (full_reimbursement IN (0, 1));
