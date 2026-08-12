import { Hono } from "hono";
import type { AppEnv } from "../auth";
import { requireAdmin, requireEmployee } from "../auth";
import { getAdminSessionEmployee } from "../adminSession";
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
  const body = await c
    .req.json<{ body?: string; employee_id?: number }>()
    .catch(() => ({}) as { body?: string; employee_id?: number });
  if (!body.body || !body.body.trim()) {
    return c.json({ error: "body is required" }, 400);
  }

  let threadEmployeeId = employee.id;
  let senderRole: "employee" | "admin" = "employee";

  // Posting into an arbitrary employee's thread as "admin" is a privileged
  // action, so it needs the real admin session — not just a client-supplied
  // x-role header, which any authenticated caller can set to whatever they like.
  const adminSession = await getAdminSessionEmployee(c);
  if (adminSession) {
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

/**
 * Send one message into many employees' threads at once.
 *
 * There is no group chat here — every thread is one employee talking to HR — so
 * a broadcast is a copy per thread rather than a shared message. That keeps
 * replies private: each person answers into their own thread and sees only
 * their own conversation.
 *
 * Omit employee_ids (or send an empty list) to reach everyone.
 */
app.post("/admin/chat/broadcast", requireAdmin, async (c) => {
  const body = await c.req
    .json<{ body?: string; employee_ids?: number[] }>()
    .catch(() => ({}) as { body?: string; employee_ids?: number[] });

  const message = typeof body.body === "string" ? body.body.trim() : "";
  if (!message) return c.json({ error: "Message body is required" }, 400);

  const requested = Array.isArray(body.employee_ids)
    ? body.employee_ids.filter((n) => Number.isInteger(n))
    : [];

  // Resolve against the employee list either way, so a stale id from the client
  // can't create a thread for someone who no longer exists.
  const recipients = requested.length
    ? await c.env.DB.prepare(
        `SELECT id, name FROM employees WHERE role = 'employee' AND id IN (${requested.map(() => "?").join(",")})`
      )
        .bind(...requested)
        .all<{ id: number; name: string }>()
    : await c.env.DB.prepare("SELECT id, name FROM employees WHERE role = 'employee' ORDER BY name").all<{
        id: number;
        name: string;
      }>();

  const rows = recipients.results ?? [];
  if (rows.length === 0) return c.json({ error: "No matching employees to message" }, 400);

  // One batch: either every thread gets the message or none does.
  await c.env.DB.batch(
    rows.map((r) =>
      c.env.DB.prepare("INSERT INTO chat_messages (employee_id, sender_role, body) VALUES (?, 'admin', ?)").bind(
        r.id,
        message,
      ),
    ),
  );

  return c.json({ sent: rows.length, names: rows.map((r) => r.name) });
});

export default app;
