import { Hono } from "hono";
import type { AppEnv } from "../auth";
import { requireAdmin, requireEmployee } from "../auth";
import { nowISO, todayISODate } from "../db";
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

interface AdminAttendanceBody {
  employee_id?: number;
  work_date?: string;
  status?: AttendanceStatus;
  clock_in?: string | null;
  clock_out?: string | null;
}

app.post("/admin/attendance", requireAdmin, async (c) => {
  const body = await c
    .req.json<AdminAttendanceBody>()
    .catch(() => ({}) as AdminAttendanceBody);

  if (!body.employee_id || !body.work_date) {
    return c.json({ error: "employee_id and work_date are required" }, 400);
  }
  const status: AttendanceStatus = body.status ?? "present";

  await c.env.DB.prepare(
    `INSERT INTO attendance (employee_id, work_date, clock_in, clock_out, status)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (employee_id, work_date)
     DO UPDATE SET clock_in = excluded.clock_in, clock_out = excluded.clock_out, status = excluded.status`
  )
    .bind(body.employee_id, body.work_date, body.clock_in ?? null, body.clock_out ?? null, status)
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM attendance WHERE employee_id = ? AND work_date = ?")
    .bind(body.employee_id, body.work_date)
    .first<Attendance>();
  return c.json(row);
});

export default app;
