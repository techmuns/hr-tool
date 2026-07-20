import { Hono } from "hono";
import type { AppEnv } from "../auth";
import { requireEmployee } from "../auth";
import { businessDaysFrom, businessDaysInRange } from "../db";
import type { LeaveRequest, LeaveType } from "../types";

const app = new Hono<AppEnv>();

app.use("*", requireEmployee);

const MAX_MARK_LEAVE_DAYS = 60;
// Annual paid-leave allowance. Leave beyond this in a calendar year is unpaid.
// This is the "logic" that decides paid vs unpaid — the employee never picks.
const PAID_LEAVE_DAYS_PER_YEAR = 12;

function yearOf(isoDate: string): number {
  return Number(isoDate.slice(0, 4));
}

app.get("/leave/me", async (c) => {
  const employee = c.get("employee");
  const rows = await c.env.DB.prepare("SELECT * FROM leave_requests WHERE employee_id = ? ORDER BY created_at DESC")
    .bind(employee.id)
    .all<LeaveRequest>();
  return c.json(rows.results);
});

// Marks the next N business days (starting today) as leave — immediately
// effective, no approval step. The server decides paid vs unpaid per day from
// the annual paid-leave allowance, splitting the block into contiguous
// same-type runs. Writes leave_requests rows (for history/payroll) and an
// attendance row per day (for the heatmap).
app.post("/leave", async (c) => {
  const employee = c.get("employee");
  type MarkLeaveBody = { days?: number; reason?: string };
  const body = await c.req.json<MarkLeaveBody>().catch(() => ({}) as MarkLeaveBody);

  const days = Math.trunc(Number(body.days));
  if (!Number.isFinite(days) || days < 1 || days > MAX_MARK_LEAVE_DAYS) {
    return c.json({ error: `days must be a whole number between 1 and ${MAX_MARK_LEAVE_DAYS}` }, 400);
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  const dates = businessDaysFrom(days);

  // Paid-leave allowance already used per relevant calendar year.
  const years = [...new Set(dates.map(yearOf))];
  const remaining = new Map<number, number>();
  for (const year of years) {
    const paidLeaves = await c.env.DB.prepare(
      "SELECT start_date, end_date FROM leave_requests WHERE employee_id = ? AND leave_type = 'paid' AND status = 'approved'"
    )
      .bind(employee.id)
      .all<{ start_date: string; end_date: string }>();
    let used = 0;
    for (const l of paidLeaves.results) {
      used += businessDaysInRange(l.start_date, l.end_date).filter((d) => yearOf(d) === year).length;
    }
    remaining.set(year, Math.max(PAID_LEAVE_DAYS_PER_YEAR - used, 0));
  }

  // Assign a type to each day, then group into contiguous same-type runs.
  const typed = dates.map((date) => {
    const year = yearOf(date);
    const left = remaining.get(year) ?? 0;
    const type: LeaveType = left > 0 ? "paid" : "unpaid";
    if (left > 0) remaining.set(year, left - 1);
    return { date, type };
  });

  let paidCount = 0;
  let unpaidCount = 0;
  const runs: { type: LeaveType; start: string; end: string }[] = [];
  for (const { date, type } of typed) {
    if (type === "paid") paidCount++;
    else unpaidCount++;
    const last = runs[runs.length - 1];
    if (last && last.type === type) last.end = date;
    else runs.push({ type, start: date, end: date });
  }

  for (const run of runs) {
    await c.env.DB.prepare(
      `INSERT INTO leave_requests (employee_id, start_date, end_date, leave_type, reason, status)
       VALUES (?, ?, ?, ?, ?, 'approved')`
    )
      .bind(employee.id, run.start, run.end, run.type, reason)
      .run();
  }

  for (const date of dates) {
    await c.env.DB.prepare(
      `INSERT INTO attendance (employee_id, work_date, clock_in, clock_out, status)
       VALUES (?, ?, NULL, NULL, 'leave')
       ON CONFLICT (employee_id, work_date)
       DO UPDATE SET clock_in = NULL, clock_out = NULL, status = 'leave'`
    )
      .bind(employee.id, date)
      .run();
  }

  return c.json({ dates, paid: paidCount, unpaid: unpaidCount });
});

export default app;
