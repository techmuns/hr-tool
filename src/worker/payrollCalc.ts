/**
 * The arithmetic behind a cycle's pay, and the three queries that feed it.
 *
 * Payroll generation and the Adjustments tab both need these numbers — the tab
 * previews what the next generation will produce — so they live here rather
 * than being written twice and drifting apart.
 *
 * Every lookup returns a Map keyed by employee id and covers the whole company
 * in one query. The tab needs every employee anyway, and generation used to run
 * two queries per person inside its loop.
 */

import { businessDaysInRange } from "./db";
import { payCycle } from "./payslip";
import type { PayCycle } from "./payslip";
import type { Employee } from "./types";

/** Company standard: every month bills the same number of working days. */
export const WORKING_DAYS_PER_MONTH = 24;

/**
 * The share of one breakup line that is reimbursed, 50 or 100. HR picks it per
 * line and it is stored as `percent` inside the entry. Two older shapes are read
 * for backward compatibility so nothing already logged changes meaning:
 *   - a per-line `full` boolean (last month's format): true → 100, false → 50;
 *   - neither present → the whole-breakup `full_reimbursement` flag.
 */
function entryPercent(entry: { percent?: unknown; full?: unknown }, fullReimbursement: boolean): number {
  if (entry.percent === 100) return 100;
  if (entry.percent === 50) return 50;
  if (entry.full === true) return 100;
  if (entry.full === false) return 50;
  return fullReimbursement ? 100 : 50;
}

/**
 * Paise a breakup actually reimburses: each logged line taken at its own
 * percent, rounded per line (so a 100% line and a 50% line don't blend into one
 * rate on the grand total). Computed straight from the stored `entries` JSON —
 * there is no separate stored figure to keep in sync. A malformed/empty JSON
 * reimburses nothing.
 */
export function reimbursedFromEntries(entriesJson: string | null | undefined, fullReimbursement: boolean): number {
  if (!entriesJson) return 0;
  let parsed: unknown;
  try {
    parsed = JSON.parse(entriesJson);
  } catch {
    return 0;
  }
  if (!Array.isArray(parsed)) return 0;
  return parsed.reduce((sum: number, e) => {
    const amount = Number.isFinite(e?.amount) ? Math.max(0, Math.round(e.amount)) : 0;
    return sum + Math.round((amount * entryPercent(e ?? {}, fullReimbursement)) / 100);
  }, 0);
}

/**
 * Unpaid leave days falling inside the cycle, per employee. Leave is stored as
 * date ranges, so each one is expanded to business days and clipped to the
 * cycle — a range straddling the 10th only counts on the side it lands.
 */
export async function unpaidLeaveDaysByEmployee(db: D1Database, cycle: PayCycle): Promise<Map<number, number>> {
  // Overlap test, not containment: a range that starts before the cycle and
  // ends inside it still contributes the days that fall within.
  const rows = await db
    .prepare(
      `SELECT employee_id, start_date, end_date FROM leave_requests
       WHERE leave_type = 'unpaid' AND status = 'approved'
         AND start_date <= ? AND end_date >= ?`
    )
    .bind(cycle.end, cycle.start)
    .all<{ employee_id: number; start_date: string; end_date: string }>();

  const days = new Map<number, number>();
  for (const leave of rows.results ?? []) {
    const inCycle = businessDaysInRange(leave.start_date, leave.end_date).filter(
      (d) => d >= cycle.start && d <= cycle.end,
    ).length;
    if (inCycle > 0) days.set(leave.employee_id, (days.get(leave.employee_id) ?? 0) + inCycle);
  }
  return days;
}

/**
 * Approved reimbursements filed during the cycle, per employee.
 *
 * Pending and rejected rows are excluded — that exclusion is the whole point of
 * the approval queue. created_at is "YYYY-MM-DD HH:MM:SS", so a plain string
 * range works: the upper bound is the pay date itself, which excludes it and
 * everything after.
 */
export async function approvedReimbursementsByEmployee(
  db: D1Database,
  cycle: PayCycle,
): Promise<Map<number, number>> {
  const rows = await db
    .prepare(
      // Each request pays at its own percent (default 100). Rounded per row
      // before summing, so one request at 50% and another at 100% don't blend.
      `SELECT employee_id, COALESCE(SUM(ROUND(amount * percent / 100.0)), 0) AS total FROM reimbursements
       WHERE status = 'approved' AND created_at >= ? AND created_at < ?
       GROUP BY employee_id`
    )
    .bind(cycle.start, cycle.payDate)
    .all<{ employee_id: number; total: number }>();

  return new Map((rows.results ?? []).map((r) => [r.employee_id, r.total]));
}

/** Manual deductions HR booked against this period, per employee. */
export async function manualDeductionsByEmployee(db: D1Database, period: string): Promise<Map<number, number>> {
  const rows = await db
    .prepare(
      `SELECT employee_id, COALESCE(SUM(amount), 0) AS total FROM deductions
       WHERE period = ?
       GROUP BY employee_id`
    )
    .bind(period)
    .all<{ employee_id: number; total: number }>();

  return new Map((rows.results ?? []).map((r) => [r.employee_id, r.total]));
}

export interface PayInputs {
  monthlySalary: number;
  unpaidDays: number;
  reimbursements: number;
  otherDeductions: number;
}

export interface PayAmounts {
  paidDays: number;
  unpaidDays: number;
  leaveDeductions: number;
  otherDeductions: number;
  /** leave + manual, i.e. what actually nets off the salary. */
  deductions: number;
  reimbursements: number;
  netPay: number;
}

/**
 * Turn a cycle's inputs into the amounts a payroll row stores. Not clocking in
 * has no effect on pay — deductions come only from leave and from what HR books
 * by hand.
 */
export function computePay({ monthlySalary, unpaidDays, reimbursements, otherDeductions }: PayInputs): PayAmounts {
  const paidDays = Math.max(WORKING_DAYS_PER_MONTH - unpaidDays, 0);
  const dailyRate = monthlySalary / WORKING_DAYS_PER_MONTH;
  const leaveDeductions = Math.round(dailyRate * unpaidDays);
  const deductions = leaveDeductions + otherDeductions;

  return {
    paidDays,
    unpaidDays,
    leaveDeductions,
    otherDeductions,
    deductions,
    reimbursements,
    netPay: monthlySalary - deductions + reimbursements,
  };
}

/**
 * Bring a period's payroll rows in line with the inputs behind them.
 *
 * Called on every read of a period rather than from a "Generate" button: the
 * amounts are a pure function of salary, unpaid leave, approved reimbursements
 * and booked deductions, so there is no state in which a stored row is more
 * correct than a freshly computed one, and no reason to make someone press
 * something to find that out.
 *
 * The one exception is a cycle whose dues are already marked paid. What was
 * paid out is a fact, not a derivation — recomputing it would rewrite history
 * every time a late reimbursement was approved, and the payslip already sitting
 * in someone's inbox would stop matching their row. Those rows are left exactly
 * as they were paid; the WHERE on the upsert is what pins them. Reopen a cycle
 * with "Mark unpaid" if it genuinely needs to move again.
 */
export async function syncPayroll(db: D1Database, period: string): Promise<void> {
  // Billing runs 11th-to-10th, not calendar months: period 2026-08 covers
  // 11 Jul – 10 Aug and is paid on 11 Aug. Every window below keys off this.
  const cycle = payCycle(period);

  // Only people kept on payroll — removed people (e.g. freelancers) and archived
  // employees are skipped.
  const [employees, unpaidLeaveDays, approvedReimbursements, manualDeductions, breakupRows] = await Promise.all([
    db.prepare("SELECT * FROM employees WHERE on_payroll = 1 AND archived = 0").all<Employee>(),
    unpaidLeaveDaysByEmployee(db, cycle),
    approvedReimbursementsByEmployee(db, cycle),
    manualDeductionsByEmployee(db, period),
    db.prepare("SELECT employee_id, entries, full_reimbursement FROM reimbursement_breakups WHERE period = ?")
      .bind(period)
      .all<{ employee_id: number; entries: string; full_reimbursement: number }>(),
  ]);

  // HR's logged reimbursement breakup and the approved-request queue are two
  // separate sources of reimbursement, so they ADD rather than one overriding
  // the other (approving a request below Payroll and logging a note in the
  // Reimb. Notes tab both count). The breakup's contribution is each logged line
  // taken at its own 50% / 100%, computed from the entries JSON.
  const breakupReimbursed = new Map(
    (breakupRows.results ?? []).map((r) => [
      r.employee_id,
      reimbursedFromEntries(r.entries, r.full_reimbursement === 1),
    ]),
  );

  const upsert = db.prepare(
    `INSERT INTO payroll (employee_id, period, base_salary, paid_days, unpaid_days, deductions,
                          leave_deductions, other_deductions, reimbursements, net_pay)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (employee_id, period)
     DO UPDATE SET base_salary = excluded.base_salary, paid_days = excluded.paid_days,
                   unpaid_days = excluded.unpaid_days, deductions = excluded.deductions,
                   leave_deductions = excluded.leave_deductions,
                   other_deductions = excluded.other_deductions,
                   reimbursements = excluded.reimbursements, net_pay = excluded.net_pay,
                   generated_at = datetime('now')
     -- Settled rows stay as they were paid. payslip_emailed_at is never touched
     -- either way: re-syncing must not forget that a payslip already went out.
     WHERE payroll.paid_at IS NULL`
  );

  const statements = (employees.results ?? []).map((employee) => {
    const pay = computePay({
      monthlySalary: employee.monthly_salary,
      unpaidDays: unpaidLeaveDays.get(employee.id) ?? 0,
      reimbursements:
        (breakupReimbursed.get(employee.id) ?? 0) + (approvedReimbursements.get(employee.id) ?? 0),
      otherDeductions: manualDeductions.get(employee.id) ?? 0,
    });
    return upsert.bind(
      employee.id,
      period,
      employee.monthly_salary,
      pay.paidDays,
      pay.unpaidDays,
      pay.deductions,
      pay.leaveDeductions,
      pay.otherDeductions,
      pay.reimbursements,
      pay.netPay,
    );
  });

  // One round trip for the whole company instead of a write per person.
  if (statements.length > 0) await db.batch(statements);
}
