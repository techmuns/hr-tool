import { Hono } from "hono";
import type { AppEnv } from "../auth";
import { requireAdmin, requireEmployee } from "../auth";
import type { ChatMessage } from "../types";

const app = new Hono<AppEnv>();

app.use("*", requireEmployee);

app.get("/chat/me", async (c) => {
  const employee = c.get("employee");
  const rows = await c.env.DB.prepare("SELECT * FROM chat_messages WHERE employee_id = ? ORDER BY created_at ASC")
    .bind(employee.id)
    .all<ChatMessage>();
  return c.json(rows.results);
});

app.get("/admin/chat", requireAdmin, async (c) => {
  const employeeId = Number(c.req.query("employee_id"));
  if (!employeeId) return c.json({ error: "employee_id is required" }, 400);
  const rows = await c.env.DB.prepare("SELECT * FROM chat_messages WHERE employee_id = ? ORDER BY created_at ASC")
    .bind(employeeId)
    .all<ChatMessage>();
  return c.json(rows.results);
});

app.post("/chat", async (c) => {
  const employee = c.get("employee");
  const role = c.req.header("x-role");
  const body = await c
    .req.json<{ body?: string; employee_id?: number }>()
    .catch(() => ({}) as { body?: string; employee_id?: number });
  if (!body.body || !body.body.trim()) {
    return c.json({ error: "body is required" }, 400);
  }

  let threadEmployeeId = employee.id;
  let senderRole: "employee" | "admin" = "employee";

  if (role === "admin" && employee.role === "admin") {
    if (!body.employee_id) return c.json({ error: "employee_id is required for admin replies" }, 400);
    threadEmployeeId = body.employee_id;
    senderRole = "admin";
  }

  const result = await c.env.DB.prepare(
    "INSERT INTO chat_messages (employee_id, sender_role, body) VALUES (?, ?, ?)"
  )
    .bind(threadEmployeeId, senderRole, body.body.trim())
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM chat_messages WHERE id = ?")
    .bind(result.meta.last_row_id)
    .first<ChatMessage>();
  return c.json(row);
});

export default app;
