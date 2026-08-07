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
import type { PayCycle } from "./payslip";

/** Company standard: every month bills the same number of working days. */
export const WORKING_DAYS_PER_MONTH = 24;

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
      `SELECT employee_id, COALESCE(SUM(amount), 0) AS total FROM reimbursements
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
