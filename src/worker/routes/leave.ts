import { Hono } from "hono";
import type { AppEnv } from "../auth";
import { requireEmployee } from "../auth";
import { todayISODate } from "../db";
import type { LeaveRequest, LeaveType } from "../types";

const app = new Hono<AppEnv>();

app.use("*", requireEmployee);

const MAX_MARK_LEAVE_DAYS = 60;

/** Business-day (Mon–Fri) dates starting today, count of them. */
function businessDaysFrom(count: number): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${todayISODate()}T00:00:00Z`);
  while (dates.length < count) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      dates.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

app.get("/leave/me", async (c) => {
  const employee = c.get("employee");
  const rows = await c.env.DB.prepare("SELECT * FROM leave_requests WHERE employee_id = ? ORDER BY created_at DESC")
    .bind(employee.id)
    .all<LeaveRequest>();
  return c.json(rows.results);
});

// Marks the next N business days (starting today) as leave for the caller —
// immediately effective, no approval step. Writes both a leave_requests
// record (for history/payroll) and an attendance row per day (for the
// heatmap).
app.post("/leave", async (c) => {
  const employee = c.get("employee");
  type MarkLeaveBody = { days?: number; leave_type?: LeaveType; reason?: string };
  const body = await c.req.json<MarkLeaveBody>().catch(() => ({}) as MarkLeaveBody);

  const days = Math.trunc(Number(body.days));
  if (!Number.isFinite(days) || days < 1 || days > MAX_MARK_LEAVE_DAYS) {
    return c.json({ error: `days must be a whole number between 1 and ${MAX_MARK_LEAVE_DAYS}` }, 400);
  }
  const leaveType: LeaveType = body.leave_type === "unpaid" ? "unpaid" : "paid";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  const dates = businessDaysFrom(days);

  const result = await c.env.DB.prepare(
    `INSERT INTO leave_requests (employee_id, start_date, end_date, leave_type, reason, status)
     VALUES (?, ?, ?, ?, ?, 'approved')`
  )
    .bind(employee.id, dates[0], dates[dates.length - 1], leaveType, reason)
    .run();

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

  const row = await c.env.DB.prepare("SELECT * FROM leave_requests WHERE id = ?")
    .bind(result.meta.last_row_id)
    .first<LeaveRequest>();
  return c.json({ leave: row, dates });
});

export default app;
