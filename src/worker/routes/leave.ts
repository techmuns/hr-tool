import { Hono } from "hono";
import type { AppEnv } from "../auth";
import { requireAdmin, requireEmployee } from "../auth";
import type { LeaveRequest, LeaveRequestWithName, LeaveStatus, LeaveType } from "../types";

const app = new Hono<AppEnv>();

app.use("*", requireEmployee);

app.get("/leave/me", async (c) => {
  const employee = c.get("employee");
  const rows = await c.env.DB.prepare("SELECT * FROM leave_requests WHERE employee_id = ? ORDER BY created_at DESC")
    .bind(employee.id)
    .all<LeaveRequest>();
  return c.json(rows.results);
});

app.post("/leave", async (c) => {
  const employee = c.get("employee");
  type LeaveBody = { start_date?: string; end_date?: string; leave_type?: LeaveType; reason?: string };
  const body = await c
    .req.json<LeaveBody>()
    .catch(() => ({}) as LeaveBody);

  if (!body.start_date || !body.end_date) {
    return c.json({ error: "start_date and end_date are required" }, 400);
  }
  const leaveType: LeaveType = body.leave_type === "unpaid" ? "unpaid" : "paid";

  const result = await c.env.DB.prepare(
    `INSERT INTO leave_requests (employee_id, start_date, end_date, leave_type, reason, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`
  )
    .bind(employee.id, body.start_date, body.end_date, leaveType, body.reason ?? "")
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM leave_requests WHERE id = ?")
    .bind(result.meta.last_row_id)
    .first<LeaveRequest>();
  return c.json(row);
});

app.get("/admin/leave", requireAdmin, async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT l.*, e.name AS employee_name FROM leave_requests l
     JOIN employees e ON e.id = l.employee_id
     ORDER BY l.created_at DESC`
  ).all<LeaveRequestWithName>();
  return c.json(rows.results);
});

app.patch("/leave/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ status?: LeaveStatus }>().catch(() => ({}) as { status?: LeaveStatus });
  if (body.status !== "approved" && body.status !== "rejected" && body.status !== "pending") {
    return c.json({ error: "status must be pending, approved, or rejected" }, 400);
  }

  await c.env.DB.prepare("UPDATE leave_requests SET status = ? WHERE id = ?").bind(body.status, id).run();

  const row = await c.env.DB.prepare("SELECT * FROM leave_requests WHERE id = ?").bind(id).first<LeaveRequest>();
  if (!row) return c.json({ error: "Leave request not found" }, 404);
  return c.json(row);
});

export default app;
