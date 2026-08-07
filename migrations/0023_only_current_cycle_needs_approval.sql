-- Narrow the reset in 0020 to the cycle that is still open.
--
-- 0020 put every reimbursement ever filed back to 'pending'. That is too wide.
-- Closed cycles have already been generated, paid and emailed as payslips, so
-- their reimbursements are settled facts — re-generating an old period with
-- those rows pending would quietly drop the money back off payslips people
-- have already been sent.
--
-- Only the open cycle needs review: period 2026-08 covers 11 Jul – 10 Aug 2026
-- and pays out on the 11th, so anything filed before 11 Jul belongs to a cycle
-- that has closed. Those go back to 'approved', which is how the old
-- auto-approving code path already treated them.
--
-- `decided_at IS NULL` is the guard that makes this safe to run late: 0020's
-- blanket reset left that column NULL, while any decision HR has actually made
-- in the Adjustments tab stamps it. So this only touches rows no human has
-- ruled on, and cannot overwrite a real approval or rejection.
UPDATE reimbursements
   SET status = 'approved'
 WHERE created_at < '2026-07-11'
   AND status = 'pending'
   AND decided_at IS NULL;
