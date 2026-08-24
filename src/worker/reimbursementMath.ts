/**
 * How a logged reimbursement breakup turns into the figure payroll pays out.
 *
 * The rate is per LINE, not per breakup: HR logs a day's spend and an admin
 * decides, for that day, whether payroll covers half of it (the standard) or
 * all of it. So a cycle can be a mix — 10/08 reimbursed in full, the rest at
 * 50% — which is the whole point of storing a flag on each entry.
 *
 * Kept free of any import so both the Worker and the browser bundle can use
 * it: the payout shown while HR is still typing has to be the same number the
 * payroll row ends up with, and two implementations would drift.
 */

import type { BreakupEntry } from "./types";

/**
 * What payroll reimburses for one line, in paise.
 *
 * Rounded per line rather than once over the sum, because each line is its own
 * decision — halving ₹2.21 and ₹3.13 separately is what "this date at 50%"
 * means, and it can differ by a paise from halving the total. Being right per
 * line is worth more than matching a total nobody quoted.
 */
export function reimbursedForEntry(entry: BreakupEntry, fallbackFull = false): number {
  const full = entry.full ?? fallbackFull;
  return full ? entry.amount : Math.round(entry.amount / 2);
}

/**
 * What payroll reimburses for a whole breakup, in paise.
 *
 * `fallbackFull` covers rows written before the per-line flag existed, whose
 * entries carry no `full` at all: those were logged under a single
 * breakup-wide switch, so its value is what each of their lines meant. Once
 * such a row is saved again the flags are materialised and the fallback stops
 * mattering.
 */
export function reimbursedTotal(entries: BreakupEntry[], fallbackFull = false): number {
  return entries.reduce((sum, e) => sum + reimbursedForEntry(e, fallbackFull), 0);
}

/** The raw amount HR logged, in paise — before any 50%/100% decision. */
export function loggedTotal(entries: BreakupEntry[]): number {
  return entries.reduce((sum, e) => sum + e.amount, 0);
}

/**
 * Whether every line is at 100%. Drives the "all at 100%" master control and
 * the badge on the payroll row; an empty breakup is not "all full".
 */
export function allFull(entries: BreakupEntry[], fallbackFull = false): boolean {
  return entries.length > 0 && entries.every((e) => (e.full ?? fallbackFull) === true);
}

/** Whether no line is at 100% — the other end of the badge's three states. */
export function noneFull(entries: BreakupEntry[], fallbackFull = false): boolean {
  return entries.every((e) => (e.full ?? fallbackFull) !== true);
}

/** "50%" / "100%" / "Mixed" — what the payroll row shows at a glance. */
export function rateLabel(entries: BreakupEntry[], fallbackFull = false): string {
  if (allFull(entries, fallbackFull)) return "100%";
  if (noneFull(entries, fallbackFull)) return "50%";
  return "Mixed";
}
