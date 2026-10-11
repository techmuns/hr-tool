-- Pin each reimbursement to the pay cycle it belongs to, explicitly.
--
-- Until now a reimbursement was bucketed into a cycle purely by its created_at:
-- approvedReimbursementsByEmployee and the Adjustments "decided this cycle" list
-- both keyed off the created_at >= cycle.start AND created_at < cycle.payDate
-- window. That has one sharp edge: a reimbursement FILED on or after the 11th
-- lands in the NEXT cycle, not the one it is meant for. So HR adding (say)
-- Vipul's October expense on 11 Oct — the day October's dues are due — had it
-- silently attributed to November, where it then looked "lost" from October's
-- point of view. There was no way to say which cycle an expense was for.
--
-- `period` ("YYYY-MM") is that cycle, pinned the same way deductions already pin
-- theirs (see 0021): a manual adjustment is booked against whichever cycle HR is
-- looking at, which is not always the one today happens to fall in. New rows
-- store it on insert; the queries prefer it and fall back to the created_at
-- window only for any row that predates this column.
--
-- Nullable + backfilled rather than NOT NULL: there is no safe default for a
-- column whose value is per-row, and a NOT NULL add would reject the table's
-- existing rows. Nothing is deleted or re-bucketed — the backfill below writes
-- exactly the period each row's created_at already resolved to, so every
-- existing reimbursement keeps the cycle it is in today.
ALTER TABLE reimbursements ADD COLUMN period TEXT;

-- Backfill from created_at using the same 11th-to-10th rule as periodForDate():
-- a row created on the 11th or later belongs to the following month's period,
-- everything earlier to its own month's. 'start of month' before the '+1 month'
-- shift avoids the end-of-month overflow that a bare '+1 month' on e.g. the 31st
-- would cause (it would skip a month). This reproduces the exact bucket the
-- created_at window gives today, so no row moves.
UPDATE reimbursements
   SET period = CASE
     WHEN CAST(strftime('%d', created_at) AS INTEGER) >= 11
       THEN strftime('%Y-%m', created_at, 'start of month', '+1 month')
     ELSE strftime('%Y-%m', created_at)
   END
 WHERE period IS NULL;

-- The cycle sum and the decided-list both filter by period now; this covers the
-- "approved rows for this period" lookup they share.
CREATE INDEX idx_reimbursements_period ON reimbursements(period, status);
