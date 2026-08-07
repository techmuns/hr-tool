/**
 * Everything that moves a cycle's pay away from the plain monthly salary:
 * reimbursement approvals, manual deductions, and the unpaid-leave deductions
 * payroll derives on its own.
 *
 * Nothing here writes to the `payroll` table. These are the *inputs* — the next
 * "Generate" on the Payroll tab reads them and recomputes the row. Keeping the
 * two apart means an approval can never disagree with the generated figure: the
 * figure is always a pure function of what is stored here.
 */

import { Hono } from "hono";
import type { AppEnv } from "../auth";
import { requireAdmin, requireEmployee } from "../auth";
import { payCycle } from "../payslip";
import {
  computePay,
  manualDeductionsByEmployee,
  unpaidLeaveDaysByEmployee,
} from "../payrollCalc";
import type {
  CycleAdjustments,
  DeductionWithName,
  Employee,
  LeaveDeduction,
  ReimbursementWithName,
} from "../types";

const app = new Hono<AppEnv>();

app.use("*", requireEmployee, requireAdmin);

const PERIOD_RE = /^\d{4}-\d{2}$/;

/** Both reimbursement lists need the same columns and the same two joins. */
const REIMBURSEMENT_SELECT = `
  SELECT r.*, e.name AS employee_name, d.name AS decided_by_name
    FROM reimbursements r
    JOIN employees e ON e.id = r.employee_id
    LEFT JOIN employees d ON d.id = r.decided_by`;

app.get("/admin/adjustments", async (c) => {
  const period = c.req.query("period") ?? "";
  if (!PERIOD_RE.test(period)) return c.json({ error: "period (YYYY-MM) is required" }, 400);
  const cycle = payCycle(period);

  const [pending, decided, deductions, employees, payrollState] = await Promise.all([
    // Not filtered by cycle on purpose: a request waiting on HR needs deciding
    // whenever it was filed, and hiding it because it predates the selected
    // month would strand it with nowhere in the UI to act on it.
    c.env.DB.prepare(`${REIMBURSEMENT_SELECT} WHERE r.status = 'pending' ORDER BY r.created_at ASC`)
      .all<ReimbursementWithName>(),
    c.env.DB.prepare(
      `${REIMBURSEMENT_SELECT}
        WHERE r.status <> 'pending' AND r.created_at >= ? AND r.created_at < ?
        ORDER BY r.created_at DESC`
    )
      .bind(cycle.start, cycle.payDate)
      .all<ReimbursementWithName>(),
    c.env.DB.prepare(
      `SELECT d.*, e.name AS employee_name, a.name AS created_by_name
         FROM deductions d
         JOIN employees e ON e.id = d.employee_id
         LEFT JOIN employees a ON a.id = d.created_by
        WHERE d.period = ?
        ORDER BY d.created_at DESC`
    )
      .bind(period)
      .all<DeductionWithName>(),
    c.env.DB.prepare("SELECT * FROM employees WHERE on_payroll = 1 ORDER BY name ASC").all<Employee>(),
    // ROWS is a SQLite keyword (window frames), hence the blander alias.
    c.env.DB.prepare(
      "SELECT COUNT(*) AS generated, COUNT(paid_at) AS paid FROM payroll WHERE period = ?"
    )
      .bind(period)
      .first<{ generated: number; paid: number }>(),
  ]);

  // Unpaid-leave cost per person, computed the same way payroll generation
  // computes it — this pane is a preview of that, not a second opinion.
  const unpaidDaysBy = await unpaidLeaveDaysByEmployee(c.env.DB, cycle);
  const leave: LeaveDeduction[] = (employees.results ?? [])
    .map((e) => {
      const unpaid_days = unpaidDaysBy.get(e.id) ?? 0;
      return {
        employee_id: e.id,
        employee_name: e.name,
        monthly_salary: e.monthly_salary,
        unpaid_days,
        amount: computePay({
          monthlySalary: e.monthly_salary,
          unpaidDays: unpaid_days,
          reimbursements: 0,
          otherDeductions: 0,
        }).leaveDeductions,
      };
    })
    .filter((l) => l.unpaid_days > 0);

  const body: CycleAdjustments = {
    period,
    cycle,
    pending: pending.results ?? [],
    reimbursements: decided.results ?? [],
    deductions: deductions.results ?? [],
    leave,
    // "Paid" only when the whole cycle is — a part-marked period is still open.
    paid: (payrollState?.generated ?? 0) > 0 && payrollState?.generated === payrollState?.paid,
    generated: (payrollState?.generated ?? 0) > 0,
  };
  return c.json(body);
});

/**
 * Approve or reject a reimbursement. Only 'approved' rows are summed into a
 * cycle, so this is the switch that decides whether the money is ever paid.
 */
app.patch("/admin/reimbursements/:id/status", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Invalid reimbursement id" }, 400);

  const body = await c.req
    .json<{ status?: string; note?: string }>()
    .catch(() => ({}) as { status?: string; note?: string });

  // 'pending' is allowed so a decision made in error can be put back in the
  // queue rather than only being reversible into the opposite decision.
  if (body.status !== "approved" && body.status !== "rejected" && body.status !== "pending") {
    return c.json({ error: "status must be 'approved', 'rejected' or 'pending'" }, 400);
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";

  const existing = await c.env.DB.prepare("SELECT id FROM reimbursements WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "Reimbursement not found" }, 404);

  const reopening = body.status === "pending";
  await c.env.DB.prepare(
    `UPDATE reimbursements
        SET status = ?,
            decided_at = ${reopening ? "NULL" : "datetime('now')"},
            decided_by = ?,
            decision_note = ?
      WHERE id = ?`
  )
    .bind(body.status, reopening ? null : c.get("employee").id, note, id)
    .run();

  const updated = await c.env.DB.prepare(`${REIMBURSEMENT_SELECT} WHERE r.id = ?`)
    .bind(id)
    .first<ReimbursementWithName>();
  return c.json(updated);
});

app.post("/admin/deductions", async (c) => {
  const body = await c.req
    .json<{ employee_id?: number; period?: string; amount?: number; note?: string }>()
    .catch(() => ({}) as { employee_id?: number; period?: string; amount?: number; note?: string });

  const employeeId = Number(body.employee_id);
  if (!Number.isInteger(employeeId)) return c.json({ error: "employee_id is required" }, 400);

  const period = typeof body.period === "string" ? body.period : "";
  if (!PERIOD_RE.test(period)) return c.json({ error: "period (YYYY-MM) is required" }, 400);

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return c.json({ error: "amount must be a positive number" }, 400);
  }
  const note = typeof body.note === "string" ? body.note.trim() : "";

  const employee = await c.env.DB.prepare("SELECT id FROM employees WHERE id = ?").bind(employeeId).first();
  if (!employee) return c.json({ error: "Employee not found" }, 404);

  const result = await c.env.DB.prepare(
    `INSERT INTO deductions (employee_id, period, amount, note, created_by) VALUES (?, ?, ?, ?, ?)`
  )
    .bind(employeeId, period, Math.round(amount), note, c.get("employee").id)
    .run();

  const created = await c.env.DB.prepare(
    `SELECT d.*, e.name AS employee_name, a.name AS created_by_name
       FROM deductions d
       JOIN employees e ON e.id = d.employee_id
       LEFT JOIN employees a ON a.id = d.created_by
      WHERE d.id = ?`
  )
    .bind(result.meta.last_row_id)
    .first<DeductionWithName>();
  return c.json(created, 201);
});

app.delete("/admin/deductions/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Invalid deduction id" }, 400);

  const result = await c.env.DB.prepare("DELETE FROM deductions WHERE id = ?").bind(id).run();
  if (!result.meta.changes) return c.json({ error: "Deduction not found" }, 404);
  return c.json({ ok: true });
});

export default app;
