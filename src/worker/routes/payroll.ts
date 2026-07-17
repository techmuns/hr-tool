import { Hono } from "hono";
import type { AppEnv } from "../auth";
import { requireAdmin } from "../auth";
import type { Employee, PayrollWithName } from "../types";

const app = new Hono<AppEnv>();

app.use("*", requireAdmin);

const WORKING_DAYS_PER_MONTH = 22;

app.get("/admin/payroll", async (c) => {
  const period = c.req.query("period");
  if (!period) return c.json({ error: "period (YYYY-MM) is required" }, 400);

  if (c.req.query("generate") === "1") {
    const employees = await c.env.DB.prepare("SELECT * FROM employees").all<Employee>();

    for (const employee of employees.results) {
      const unpaidRow = await c.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM attendance
         WHERE employee_id = ? AND work_date LIKE ? AND status = 'absent'`
      )
        .bind(employee.id, `${period}%`)
        .first<{ n: number }>();
      const unpaidLeaveRow = await c.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM leave_requests
         WHERE employee_id = ? AND leave_type = 'unpaid' AND status = 'approved'
           AND start_date LIKE ?`
      )
        .bind(employee.id, `${period}%`)
        .first<{ n: number }>();

      const unpaidDays = (unpaidRow?.n ?? 0) + (unpaidLeaveRow?.n ?? 0);
      const paidDays = Math.max(WORKING_DAYS_PER_MONTH - unpaidDays, 0);
      const dailyRate = employee.monthly_salary / WORKING_DAYS_PER_MONTH;
      const deductions = Math.round(dailyRate * unpaidDays);
      const netPay = employee.monthly_salary - deductions;

      await c.env.DB.prepare(
        `INSERT INTO payroll (employee_id, period, base_salary, paid_days, unpaid_days, deductions, net_pay)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (employee_id, period)
         DO UPDATE SET base_salary = excluded.base_salary, paid_days = excluded.paid_days,
                       unpaid_days = excluded.unpaid_days, deductions = excluded.deductions,
                       net_pay = excluded.net_pay, generated_at = datetime('now')`
      )
        .bind(employee.id, period, employee.monthly_salary, paidDays, unpaidDays, deductions, netPay)
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

export default app;
