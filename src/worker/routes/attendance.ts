import { Hono } from "hono";
import type { AppEnv } from "../auth";
import { requireAdmin, requireEmployee } from "../auth";
import { nowISO, todayISODate } from "../db";
import { runAttendanceReminders, sendRemindersToEmployees } from "../attendanceReminders";
import type { Attendance, AttendanceStatus, AttendanceWithName } from "../types";

const app = new Hono<AppEnv>();

app.use("*", requireEmployee);

app.post("/attendance/clock-in", async (c) => {
  const employee = c.get("employee");
  const workDate = todayISODate();
  const now = nowISO();

  await c.env.DB.prepare(
    `INSERT INTO attendance (employee_id, work_date, clock_in, status)
     VALUES (?, ?, ?, 'present')
     ON CONFLICT (employee_id, work_date)
     DO UPDATE SET clock_in = excluded.clock_in, status = 'present'`
  )
    .bind(employee.id, workDate, now)
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM attendance WHERE employee_id = ? AND work_date = ?")
    .bind(employee.id, workDate)
    .first<Attendance>();
  return c.json(row);
});

app.post("/attendance/clock-out", async (c) => {
  const employee = c.get("employee");
  const workDate = todayISODate();
  const now = nowISO();

  const existing = await c.env.DB.prepare("SELECT * FROM attendance WHERE employee_id = ? AND work_date = ?")
    .bind(employee.id, workDate)
    .first<Attendance>();

  if (!existing) {
    return c.json({ error: "Clock in before clocking out" }, 400);
  }

  await c.env.DB.prepare("UPDATE attendance SET clock_out = ? WHERE employee_id = ? AND work_date = ?")
    .bind(now, employee.id, workDate)
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM attendance WHERE employee_id = ? AND work_date = ?")
    .bind(employee.id, workDate)
    .first<Attendance>();
  return c.json(row);
});

app.get("/attendance/me", async (c) => {
  const employee = c.get("employee");
  const month = c.req.query("month");
  let query = "SELECT * FROM attendance WHERE employee_id = ?";
  const params: (string | number)[] = [employee.id];
  if (month) {
    query += " AND work_date LIKE ?";
    params.push(`${month}%`);
  }
  query += " ORDER BY work_date DESC";
  const rows = await c.env.DB.prepare(query).bind(...params).all<Attendance>();
  return c.json(rows.results);
});

app.get("/admin/attendance", requireAdmin, async (c) => {
  const month = c.req.query("month");
  let query = `SELECT a.*, e.name AS employee_name FROM attendance a
               JOIN employees e ON e.id = a.employee_id`;
  const params: (string | number)[] = [];
  if (month) {
    query += " WHERE a.work_date LIKE ?";
    params.push(`${month}%`);
  }
  query += " ORDER BY a.work_date DESC, e.name ASC";
  const rows = await c.env.DB.prepare(query).bind(...params).all<AttendanceWithName>();
  return c.json(rows.results);
});

/**
 * Send clock-in reminders on demand. Two modes, mirroring how payslips send:
 *  - with `employee_ids`: remind exactly those people (per-row "Send reminder"),
 *    regardless of the 3-day threshold — HR picked them.
 *  - without: run the same pass the weekday cron does (only people who've missed
 *    the last 3 working days, de-duped), minus the weekday-only guard, so HR can
 *    fire the whole batch "just in case" the cron didn't run.
 */
app.post("/admin/attendance/reminders", requireAdmin, async (c) => {
  const body = await c.req
    .json<{ employee_ids?: number[] }>()
    .catch(() => ({}) as { employee_ids?: number[] });

  if (Array.isArray(body.employee_ids) && body.employee_ids.length > 0) {
    const ids = body.employee_ids.filter((id) => Number.isInteger(id));
    return c.json(await sendRemindersToEmployees(c.env, ids));
  }

  return c.json(await runAttendanceReminders(c.env, { manual: true }));
});

interface AdminAttendanceBody {
  employee_id?: number;
  work_date?: string;
  status?: AttendanceStatus;
  clock_in?: string | null;
  clock_out?: string | null;
  /** 1 marks a present day as worked in-office; ignored unless status is present. */
  in_office?: boolean;
  /**
   * 1 marks the day work-from-home. Usually paired with status "present"
   * (mutually exclusive with in_office/half_day there); also allowed with
   * status "absent" — HR marking someone WFH who never clocked in. Ignored
   * for "leave".
   */
  wfh?: boolean;
  /** 1 marks a present day as half-day; ignored unless status is present. */
  half_day?: boolean;
}

app.post("/admin/attendance", requireAdmin, async (c) => {
  const body = await c
    .req.json<AdminAttendanceBody>()
    .catch(() => ({}) as AdminAttendanceBody);

  if (!body.employee_id || !body.work_date) {
    return c.json({ error: "employee_id and work_date are required" }, 400);
  }
  const status: AttendanceStatus = body.status ?? "present";
  // in-office / half-day only mean anything for a present day, and are
  // mutually exclusive with each other and with wfh (in-office wins if
  // somehow more than one is set); a non-present day clears both so neither
  // keeps counting once the status moves on.
  const inOffice = status === "present" && body.in_office ? 1 : 0;
  const halfDay = status === "present" && body.half_day && !inOffice ? 1 : 0;
  // WFH is the one flag that also means something on an "absent" day — HR
  // marking someone WFH who never clocked in. The cell still renders as
  // "not clocked in" (see AttendanceTable/WorkingDays); only its second line
  // and the payroll WFH count change. Never set on "leave".
  const wfh =
    body.wfh && ((status === "present" && !inOffice && !halfDay) || status === "absent") ? 1 : 0;

  await c.env.DB.prepare(
    `INSERT INTO attendance (employee_id, work_date, clock_in, clock_out, status, in_office, wfh, half_day)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (employee_id, work_date)
     DO UPDATE SET clock_in = excluded.clock_in, clock_out = excluded.clock_out,
                   status = excluded.status, in_office = excluded.in_office, wfh = excluded.wfh,
                   half_day = excluded.half_day`
  )
    .bind(
      body.employee_id,
      body.work_date,
      body.clock_in ?? null,
      body.clock_out ?? null,
      status,
      inOffice,
      wfh,
      halfDay,
    )
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM attendance WHERE employee_id = ? AND work_date = ?")
    .bind(body.employee_id, body.work_date)
    .first<Attendance>();
  return c.json(row);
});

/**
 * Remove someone from the attendance list: flag them off-attendance so they no
 * longer appear in the admin attendance grid. Their existing records are kept.
 * Re-add them from the employee panel's "Include in attendance list" toggle.
 */
app.delete("/admin/attendance/employee/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  if (Number.isNaN(id)) return c.json({ error: "Invalid employee id" }, 400);

  const existing = await c.env.DB.prepare("SELECT id FROM employees WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "Employee not found" }, 404);

  await c.env.DB.prepare("UPDATE employees SET on_attendance = 0 WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

export default app;
