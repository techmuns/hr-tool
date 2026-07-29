import { Hono } from "hono";
import type { AppEnv } from "../auth";
import { requireAdmin } from "../auth";
import { businessDaysInRange } from "../db";
import type { Employee, PayrollWithName } from "../types";

const app = new Hono<AppEnv>();

app.use("*", requireAdmin);

const WORKING_DAYS_PER_MONTH = 24;

app.get("/admin/payroll", async (c) => {
  const period = c.req.query("period");
  if (!period) return c.json({ error: "period (YYYY-MM) is required" }, 400);

  if (c.req.query("generate") === "1") {
    // Only people kept on payroll — removed people (e.g. freelancers) are skipped.
    const employees = await c.env.DB.prepare("SELECT * FROM employees WHERE on_payroll = 1").all<Employee>();

    for (const employee of employees.results) {
      // Not clocking in has no effect on pay — deductions come only from leave.

      // Unpaid leave days that fall inside the period (leave requests store
      // ranges, so expand them to business days and count those in-period).
      const unpaidLeaves = await c.env.DB.prepare(
        `SELECT start_date, end_date FROM leave_requests
         WHERE employee_id = ? AND leave_type = 'unpaid' AND status = 'approved'`
      )
        .bind(employee.id)
        .all<{ start_date: string; end_date: string }>();
      let unpaidLeaveDays = 0;
      for (const l of unpaidLeaves.results) {
        unpaidLeaveDays += businessDaysInRange(l.start_date, l.end_date).filter((d) => d.startsWith(period)).length;
      }

      // Reimbursements submitted during the period, added on top of salary.
      const reimbursementRow = await c.env.DB.prepare(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM reimbursements
         WHERE employee_id = ? AND created_at LIKE ?`
      )
        .bind(employee.id, `${period}%`)
        .first<{ total: number }>();
      const reimbursements = reimbursementRow?.total ?? 0;

      const unpaidDays = unpaidLeaveDays;
      const paidDays = Math.max(WORKING_DAYS_PER_MONTH - unpaidDays, 0);
      const dailyRate = employee.monthly_salary / WORKING_DAYS_PER_MONTH;
      const deductions = Math.round(dailyRate * unpaidDays);
      const netPay = employee.monthly_salary - deductions + reimbursements;

      await c.env.DB.prepare(
        `INSERT INTO payroll (employee_id, period, base_salary, paid_days, unpaid_days, deductions, reimbursements, net_pay)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (employee_id, period)
         DO UPDATE SET base_salary = excluded.base_salary, paid_days = excluded.paid_days,
                       unpaid_days = excluded.unpaid_days, deductions = excluded.deductions,
                       reimbursements = excluded.reimbursements, net_pay = excluded.net_pay,
                       generated_at = datetime('now')`
      )
        .bind(employee.id, period, employee.monthly_salary, paidDays, unpaidDays, deductions, reimbursements, netPay)
        .run();
    }
  }

  const rows = await c.env.DB.prepare(
    `SELECT p.*, e.name AS employee_name FROM payroll p
     JOIN employees e ON e.id = p.employee_id
     WHERE p.period = ?
     ORDER BY e.name ASC`
  )
    .bind(period)
    .all<PayrollWithName>();

  return c.json(rows.results);
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
