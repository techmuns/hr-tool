import { Hono } from "hono";
import type { AppEnv } from "../auth";
import { requireAdmin } from "../auth";
import { sendRawEmail } from "../email";
import type { PayslipRow } from "../payslip";
import { payslipHtml, payslipSubject, payCycle } from "../payslip";
import { syncPayroll } from "../payrollCalc";
import type { AdminPayrollRow } from "../types";

const app = new Hono<AppEnv>();

app.use("*", requireAdmin);

const PERIOD_RE = /^\d{4}-\d{2}$/;

app.get("/admin/payroll", async (c) => {
  const period = c.req.query("period");
  if (!period || !PERIOD_RE.test(period)) return c.json({ error: "period (YYYY-MM) is required" }, 400);

  // Recomputed on every read, so the figures always reflect the approvals,
  // deductions and leave behind them. Cycles already marked paid are left
  // alone — see syncPayroll.
  await syncPayroll(c.env.DB, period);

  // Count the cycle's present / in-office days live from attendance (11th–10th
  // window), so the payroll tab can show the in-office vs WFH split per person.
  const cycle = payCycle(period);
  const rows = await c.env.DB.prepare(
    `SELECT p.*, e.name AS employee_name, e.email AS employee_email, e.job_title,
            e.employment_type, e.date_of_joining, e.location, e.work_mode,
            (SELECT COUNT(*) FROM attendance a
               WHERE a.employee_id = p.employee_id AND a.status = 'present'
                 AND a.work_date BETWEEN ? AND ?) AS present_days,
            (SELECT COUNT(*) FROM attendance a
               WHERE a.employee_id = p.employee_id AND a.status = 'present' AND a.in_office = 1
                 AND a.work_date BETWEEN ? AND ?) AS in_office_days
     FROM payroll p
     JOIN employees e ON e.id = p.employee_id
     WHERE p.period = ?
     ORDER BY e.name ASC`
  )
    .bind(cycle.start, cycle.end, cycle.start, cycle.end, period)
    .all<AdminPayrollRow>();

  return c.json(rows.results);
});

/**
 * Mark dues paid (or undo it). Payroll runs in arrears — a period's salaries go
 * out on the 11th of the following month — so this is the record of "we've
 * actually transferred this month's money".
 *
 * With `employee_id`, only that one person's row is settled (the per-row "Mark
 * paid" button); without it, the whole cycle is. Either way we sync first when
 * marking paid, since a settled row stops tracking its inputs and had better be
 * up to date at that moment. paid_at lives per row, and syncPayroll already
 * freezes any row whose paid_at is set, so a mix of paid and unpaid people in
 * one cycle is fully supported.
 */
app.post("/admin/payroll/paid", async (c) => {
  const body = await c.req
    .json<{ period?: string; paid?: boolean; employee_id?: number }>()
    .catch(() => ({}) as { period?: string; paid?: boolean; employee_id?: number });

  const period = typeof body.period === "string" ? body.period : "";
  if (!PERIOD_RE.test(period)) return c.json({ error: "period (YYYY-MM) is required" }, 400);
  const paid = body.paid !== false; // default to marking paid
  const employeeId = Number.isInteger(body.employee_id) ? (body.employee_id as number) : null;

  if (paid) await syncPayroll(c.env.DB, period);

  const setClause = `paid_at = ${paid ? "datetime('now')" : "NULL"}`;
  const result = employeeId != null
    ? await c.env.DB.prepare(`UPDATE payroll SET ${setClause} WHERE period = ? AND employee_id = ?`)
        .bind(period, employeeId)
        .run()
    : await c.env.DB.prepare(`UPDATE payroll SET ${setClause} WHERE period = ?`).bind(period).run();

  if (!result.meta.changes) {
    return c.json(
      { error: employeeId != null ? "No payroll row for that person this cycle" : "No payroll for that period yet — generate it first" },
      404,
    );
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

  // A payslip is the most public thing this app produces — emailing a figure
  // that a just-made approval has already moved past is the one staleness that
  // cannot be fixed by reloading. No-op on a paid cycle, which stays frozen.
  await syncPayroll(c.env.DB, period);

  const rows = await c.env.DB.prepare(
    `SELECT p.id, p.employee_id, p.period, p.paid_days, p.unpaid_days, p.base_salary, p.reimbursements,
            p.deductions, p.leave_deductions, p.other_deductions, p.net_pay, p.paid_at,
            e.name AS employee_name, e.email AS employee_email, e.job_title,
            e.employment_type, e.date_of_joining, e.location
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
        html: payslipHtml(row),
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
