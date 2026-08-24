import { Hono } from "hono";
import type { AppEnv } from "../auth";
import { requireAdmin, requireEmployee } from "../auth";
import { sendRawEmail } from "../email";
import type { PayslipRow } from "../payslip";
import { payslipHtml, payslipSubject, payCycle } from "../payslip";
import { syncPayroll } from "../payrollCalc";
import { allFull, loggedTotal, reimbursedTotal } from "../reimbursementMath";
import type { AdminPayrollRow, BreakupEntry } from "../types";

const app = new Hono<AppEnv>();

app.use("*", requireEmployee, requireAdmin);

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
            rb.total AS reimbursement_breakup_total,
            rb.entries AS reimbursement_breakup_entries,
            rb.full_reimbursement AS reimbursement_breakup_full,
            rb.reimbursed_total AS reimbursement_breakup_reimbursed,
            (SELECT COUNT(*) FROM attendance a
               WHERE a.employee_id = p.employee_id AND a.status = 'present'
                 AND a.work_date BETWEEN ? AND ?) AS present_days,
            (SELECT COUNT(*) FROM attendance a
               WHERE a.employee_id = p.employee_id AND a.status = 'present' AND a.in_office = 1
                 AND a.work_date BETWEEN ? AND ?) AS in_office_days,
            (SELECT COUNT(*) FROM attendance a
               WHERE a.employee_id = p.employee_id AND a.status = 'present' AND a.wfh = 1
                 AND a.work_date BETWEEN ? AND ?) AS wfh_days
     FROM payroll p
     JOIN employees e ON e.id = p.employee_id
     LEFT JOIN reimbursement_breakups rb ON rb.employee_id = p.employee_id AND rb.period = p.period
     WHERE p.period = ? AND e.archived = 0
     ORDER BY e.name ASC`
  )
    .bind(cycle.start, cycle.end, cycle.start, cycle.end, cycle.start, cycle.end, period)
    .all<AdminPayrollRow>();

  return c.json(rows.results);
});

function safeParseEntries(json: string): BreakupEntry[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Normalise whatever a client sent into storable lines. `full` is only ever
 * written as a real boolean so the "flag absent = legacy row" fallback in
 * reimbursementMath stays meaningful — an entry that has been through here
 * has decided, one way or the other.
 */
function normaliseEntries(raw: unknown): BreakupEntry[] {
  return (Array.isArray(raw) ? raw : [])
    .map((e: { label?: unknown; amount?: unknown; full?: unknown }) => ({
      label: typeof e.label === "string" ? e.label.slice(0, 200) : "",
      amount: Number.isFinite(e.amount) ? Math.max(0, Math.round(e.amount as number)) : 0,
      full: e.full === true,
    }))
    .filter((e) => e.label !== "" || e.amount > 0);
}

interface BreakupBody {
  employee_id?: number;
  period?: string;
  entries?: { label?: string; amount?: number; full?: boolean }[];
}

/** Body of the 50%/100% rate PATCH. `entry_index` absent = every line. */
interface RateBody {
  employee_id?: number;
  period?: string;
  full_reimbursement?: boolean;
  entry_index?: number;
  expected_amount?: number;
}

/**
 * View HR's reimbursement breakups for a cycle, keyed nowhere — just a list the
 * Reimb. Notes tab and Payroll dropdown read. Any admin (HR or founder) can see
 * these; only HR can write them (see the PUT below).
 */
app.get("/admin/reimbursement-breakup", async (c) => {
  const period = c.req.query("period");
  if (!period || !PERIOD_RE.test(period)) return c.json({ error: "period (YYYY-MM) is required" }, 400);

  const rows = await c.env.DB.prepare(
    `SELECT employee_id, period, entries, total, reimbursed_total, full_reimbursement, updated_at
       FROM reimbursement_breakups WHERE period = ?`,
  )
    .bind(period)
    .all<{
      employee_id: number;
      period: string;
      entries: string;
      total: number;
      reimbursed_total: number;
      full_reimbursement: number;
      updated_at: string;
    }>();

  return c.json(
    (rows.results ?? []).map((r) => ({
      employee_id: r.employee_id,
      period: r.period,
      // A legacy row's lines carry no flag of their own; surface them already
      // resolved against the row's switch so no client has to know that rule.
      entries: safeParseEntries(r.entries).map((e) => ({
        ...e,
        full: e.full ?? r.full_reimbursement === 1,
      })),
      total: r.total,
      reimbursed_total: r.reimbursed_total,
      full_reimbursement: r.full_reimbursement === 1,
      updated_at: r.updated_at,
    })),
  );
});

/**
 * Save an employee's reimbursement breakup for a cycle — HR ONLY (founders can
 * view it but not rewrite the notepad lines; see the PATCH below for what they
 * CAN do). Stores the lines, the raw logged total, and the payout those lines
 * come to at their individual 50%/100% rates. syncPayroll runs here so the
 * figure updates at once. Amounts are in paise.
 */
app.put("/admin/reimbursement-breakup", async (c) => {
  const editor = c.get("employee");
  if (editor.tier !== "hr") {
    return c.json({ error: "Only HR can edit reimbursement breakups" }, 403);
  }

  const body = await c.req.json<BreakupBody>().catch(() => ({}) as BreakupBody);
  const employeeId = Number(body.employee_id);
  const period = typeof body.period === "string" ? body.period : "";
  if (!Number.isInteger(employeeId)) return c.json({ error: "employee_id is required" }, 400);
  if (!PERIOD_RE.test(period)) return c.json({ error: "period (YYYY-MM) is required" }, 400);

  const entries = normaliseEntries(body.entries);

  if (entries.length === 0) {
    // Cleared to nothing → drop the breakup entirely so payroll stops applying
    // it (this is how HR "removes" a reimbursement — it disappears from Payroll,
    // falling back to any approved requests, which for notepad-only use is zero).
    await c.env.DB.prepare("DELETE FROM reimbursement_breakups WHERE employee_id = ? AND period = ?")
      .bind(employeeId, period)
      .run();
    await syncPayroll(c.env.DB, period);
    return c.json({ employee_id: employeeId, period, entries, total: 0, reimbursed_total: 0, full_reimbursement: false });
  }

  const saved = await writeBreakup(c.env.DB, employeeId, period, entries, editor.id);

  // Recompute so the Payroll tab reflects it immediately. No-op on a cycle
  // already marked paid (those stay frozen).
  await syncPayroll(c.env.DB, period);

  return c.json({ employee_id: employeeId, period, ...saved });
});

/**
 * Persist a breakup's lines together with the two figures derived from them,
 * so every write path agrees on what "the payout" and "all at 100%" mean.
 */
async function writeBreakup(
  db: D1Database,
  employeeId: number,
  period: string,
  entries: BreakupEntry[],
  editorId: number,
) {
  const total = loggedTotal(entries);
  const reimbursed = reimbursedTotal(entries);
  const everyLineFull = allFull(entries);

  await db
    .prepare(
      `INSERT INTO reimbursement_breakups
         (employee_id, period, entries, total, reimbursed_total, full_reimbursement, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)
       ON CONFLICT (employee_id, period)
       DO UPDATE SET entries = excluded.entries, total = excluded.total,
                     reimbursed_total = excluded.reimbursed_total,
                     full_reimbursement = excluded.full_reimbursement,
                     updated_at = datetime('now'), updated_by = excluded.updated_by`,
    )
    .bind(employeeId, period, JSON.stringify(entries), total, reimbursed, everyLineFull ? 1 : 0, editorId)
    .run();

  return { entries, total, reimbursed_total: reimbursed, full_reimbursement: everyLineFull };
}

/**
 * Set the 50%/100% rate on a breakup — ONE line of it with `entry_index`, or
 * every line without. This is the edit ANY admin can make, HR or founder:
 * unlike the PUT it never adds, removes or re-labels a line and never creates
 * a breakup (404s if there isn't one), it only moves money between half and
 * full on lines HR already logged. That's narrow enough to hand to a founder
 * reviewing dues, so it gets its own route rather than loosening the PUT.
 *
 * `expected_amount` guards the indexed form: the client is working from a list
 * it fetched, and if HR has since inserted or removed a line, that index now
 * points at a different date. Rather than silently pay out the wrong day, a
 * mismatch is refused and the caller reloads.
 */
app.patch("/admin/reimbursement-breakup/full", async (c) => {
  const editor = c.get("employee");
  const body = await c.req
    .json<RateBody>()
    .catch(() => ({}) as RateBody);

  const employeeId = Number(body.employee_id);
  const period = typeof body.period === "string" ? body.period : "";
  if (!Number.isInteger(employeeId)) return c.json({ error: "employee_id is required" }, 400);
  if (!PERIOD_RE.test(period)) return c.json({ error: "period (YYYY-MM) is required" }, 400);
  const fullReimbursement = body.full_reimbursement === true;

  const existing = await c.env.DB.prepare(
    "SELECT entries, full_reimbursement FROM reimbursement_breakups WHERE employee_id = ? AND period = ?",
  )
    .bind(employeeId, period)
    .first<{ entries: string; full_reimbursement: number }>();

  if (!existing) {
    return c.json({ error: "No reimbursement breakup logged for this employee this cycle" }, 404);
  }

  // Resolve legacy flagless lines against the row's switch before touching one,
  // so flipping a single date doesn't silently reset the others to 50%.
  const wasFull = existing.full_reimbursement === 1;
  const entries: BreakupEntry[] = safeParseEntries(existing.entries).map((e) => ({
    ...e,
    full: e.full ?? wasFull,
  }));

  const index = body.entry_index;
  if (index !== undefined) {
    if (!Number.isInteger(index) || index < 0 || index >= entries.length) {
      return c.json({ error: "entry_index is out of range for this breakup" }, 400);
    }
    if (Number.isFinite(body.expected_amount) && entries[index].amount !== body.expected_amount) {
      return c.json(
        { error: "This breakup changed while you were looking at it — reload and try again" },
        409,
      );
    }
    entries[index] = { ...entries[index], full: fullReimbursement };
  } else {
    for (let i = 0; i < entries.length; i++) entries[i] = { ...entries[i], full: fullReimbursement };
  }

  const saved = await writeBreakup(c.env.DB, employeeId, period, entries, editor.id);

  // Recompute so the Payroll tab reflects it immediately. No-op on a cycle
  // already marked paid (those stay frozen).
  await syncPayroll(c.env.DB, period);

  return c.json({ employee_id: employeeId, period, ...saved });
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
