import { Hono } from "hono";
import type { AppEnv } from "../auth";
import { requireAdmin } from "../auth";
import { sendRawEmail } from "../email";
import type { PayslipRow } from "../payslip";
import { payCycle, payslipSubject, payslipText } from "../payslip";
import {
  approvedReimbursementsByEmployee,
  computePay,
  manualDeductionsByEmployee,
  unpaidLeaveDaysByEmployee,
} from "../payrollCalc";
import type { Employee, PayrollWithName } from "../types";

const app = new Hono<AppEnv>();

app.use("*", requireAdmin);

app.get("/admin/payroll", async (c) => {
  const period = c.req.query("period");
  if (!period) return c.json({ error: "period (YYYY-MM) is required" }, 400);

  if (c.req.query("generate") === "1") {
    // Billing runs 11th-to-10th, not calendar months: period 2026-08 covers
    // 11 Aug – 10 Sep and is paid on 11 Sep. Both windows below key off this.
    const cycle = payCycle(period);

    // Only people kept on payroll — removed people (e.g. freelancers) are skipped.
    const employees = await c.env.DB.prepare("SELECT * FROM employees WHERE on_payroll = 1").all<Employee>();

    // Three company-wide lookups up front rather than per person inside the
    // loop. Reimbursements only count once HR has approved them.
    const [unpaidLeaveDays, approvedReimbursements, manualDeductions] = await Promise.all([
      unpaidLeaveDaysByEmployee(c.env.DB, cycle),
      approvedReimbursementsByEmployee(c.env.DB, cycle),
      manualDeductionsByEmployee(c.env.DB, period),
    ]);

    for (const employee of employees.results) {
      const pay = computePay({
        monthlySalary: employee.monthly_salary,
        unpaidDays: unpaidLeaveDays.get(employee.id) ?? 0,
        reimbursements: approvedReimbursements.get(employee.id) ?? 0,
        otherDeductions: manualDeductions.get(employee.id) ?? 0,
      });

      // Re-generating recomputes the amounts but deliberately leaves paid_at and
      // payslip_emailed_at alone: a re-run shouldn't silently forget that this
      // cycle was already paid out or that payslips already went to people.
      await c.env.DB.prepare(
        `INSERT INTO payroll (employee_id, period, base_salary, paid_days, unpaid_days, deductions,
                              leave_deductions, other_deductions, reimbursements, net_pay)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (employee_id, period)
         DO UPDATE SET base_salary = excluded.base_salary, paid_days = excluded.paid_days,
                       unpaid_days = excluded.unpaid_days, deductions = excluded.deductions,
                       leave_deductions = excluded.leave_deductions,
                       other_deductions = excluded.other_deductions,
                       reimbursements = excluded.reimbursements, net_pay = excluded.net_pay,
                       generated_at = datetime('now')`
      )
        .bind(
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
        )
        .run();
    }
  }

  const rows = await c.env.DB.prepare(
    `SELECT p.*, e.name AS employee_name, e.email AS employee_email FROM payroll p
     JOIN employees e ON e.id = p.employee_id
     WHERE p.period = ?
     ORDER BY e.name ASC`
  )
    .bind(period)
    .all<PayrollWithName>();

  return c.json(rows.results);
});

const PERIOD_RE = /^\d{4}-\d{2}$/;

/**
 * Mark a whole cycle's dues paid (or undo it). Payroll runs in arrears — a
 * period's salaries go out on the 11th of the following month — so this is the
 * record of "we've actually transferred this month's money".
 */
app.post("/admin/payroll/paid", async (c) => {
  const body = await c.req
    .json<{ period?: string; paid?: boolean }>()
    .catch(() => ({}) as { period?: string; paid?: boolean });

  const period = typeof body.period === "string" ? body.period : "";
  if (!PERIOD_RE.test(period)) return c.json({ error: "period (YYYY-MM) is required" }, 400);
  const paid = body.paid !== false; // default to marking paid

  const result = await c.env.DB.prepare(
    `UPDATE payroll SET paid_at = ${paid ? "datetime('now')" : "NULL"} WHERE period = ?`
  )
    .bind(period)
    .run();

  if (!result.meta.changes) {
    return c.json({ error: "No payroll for that period yet — generate it first" }, 404);
  }
  return c.json({ ok: true, updated: result.meta.changes });
});

/** Guard against a bulk send blowing the Worker's per-request subrequest limit. */
const MAX_EMAILS_PER_REQUEST = 100;

interface PayslipQueryRow extends PayslipRow {
  id: number;
  employee_email: string | null;
}

/**
 * Email payslips for a period to the selected employees. Sends are independent:
 * one bad address doesn't abort the rest, and the response reports exactly who
 * went out and who didn't, so HR can retry just the failures.
 */
app.post("/admin/payroll/email", async (c) => {
  const body = await c.req
    .json<{ period?: string; employee_ids?: number[] }>()
    .catch(() => ({}) as { period?: string; employee_ids?: number[] });

  const period = typeof body.period === "string" ? body.period : "";
  if (!PERIOD_RE.test(period)) return c.json({ error: "period (YYYY-MM) is required" }, 400);

  const ids = Array.isArray(body.employee_ids) ? body.employee_ids.filter((n) => Number.isInteger(n)) : [];
  if (ids.length === 0) return c.json({ error: "Select at least one employee to email" }, 400);
  if (ids.length > MAX_EMAILS_PER_REQUEST) {
    return c.json({ error: `Select at most ${MAX_EMAILS_PER_REQUEST} people per send` }, 400);
  }

  const rows = await c.env.DB.prepare(
    `SELECT p.id, p.period, p.paid_days, p.unpaid_days, p.base_salary, p.reimbursements,
            p.deductions, p.leave_deductions, p.other_deductions, p.net_pay, p.paid_at,
            e.name AS employee_name, e.email AS employee_email, e.job_title
     FROM payroll p
     JOIN employees e ON e.id = p.employee_id
     WHERE p.period = ? AND p.employee_id IN (${ids.map(() => "?").join(",")})
     ORDER BY e.name ASC`
  )
    .bind(period, ...ids)
    .all<PayslipQueryRow>();

  const sent: string[] = [];
  const failed: { name: string; error: string }[] = [];

  for (const row of rows.results ?? []) {
    if (!row.employee_email) {
      failed.push({ name: row.employee_name, error: "No email address on file" });
      continue;
    }
    try {
      await sendRawEmail(c.env, {
        email: row.employee_email,
        subject: payslipSubject(period),
        text: payslipText(row),
      });
      await c.env.DB.prepare("UPDATE payroll SET payslip_emailed_at = datetime('now') WHERE id = ?")
        .bind(row.id)
        .run();
      sent.push(row.employee_name);
    } catch (err) {
      failed.push({ name: row.employee_name, error: err instanceof Error ? err.message : "Send failed" });
    }
  }

  return c.json({ sent, failed });
});

/**
 * Remove someone from payroll: flag them off-payroll (so future generations
 * skip them) and delete their existing payroll rows so they drop off the list.
 * Re-add them from the employee panel's "Include in payroll" toggle.
 */
app.delete("/admin/payroll/employee/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (Number.isNaN(id)) return c.json({ error: "Invalid employee id" }, 400);

  const existing = await c.env.DB.prepare("SELECT id FROM employees WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "Employee not found" }, 404);

  await c.env.DB.prepare("UPDATE employees SET on_payroll = 0 WHERE id = ?").bind(id).run();
  await c.env.DB.prepare("DELETE FROM payroll WHERE employee_id = ?").bind(id).run();
  return c.json({ ok: true });
});

export default app;
