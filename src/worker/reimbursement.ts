/**
 * Per-line reimbursement math for HR's daily breakup.
 *
 * Each logged line is reimbursed at 100% (full) or 50% (half, rounding the odd
 * paise up), chosen per line by HR. Kept as a tiny dependency-free module so the
 * worker (payroll sync + the save route) and the web UI share exactly one rule —
 * there is no second place for the rounding to drift.
 */

/** Reimbursed paise for one logged line at its chosen rate. */
export function reimbursedForEntry(amountPaise: number, full: boolean): number {
  return full ? amountPaise : Math.round(amountPaise / 2);
}

/** Total reimbursed paise across a breakup's lines. */
export function reimbursedTotal(entries: ReadonlyArray<{ amount: number; full: boolean }>): number {
  return entries.reduce((sum, e) => sum + reimbursedForEntry(e.amount, e.full), 0);
}
