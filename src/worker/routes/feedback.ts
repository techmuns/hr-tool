import { Hono } from "hono";
import type { AppEnv } from "../auth";
import { requireEmployee, requireFounder } from "../auth";
import type { Feedback, FeedbackWithName } from "../types";

const app = new Hono<AppEnv>();

app.use("*", requireEmployee);

app.post("/feedback", async (c) => {
  const employee = c.get("employee");
  const body = await c
    .req.json<{ message?: string; anonymous?: boolean }>()
    .catch(() => ({}) as { message?: string; anonymous?: boolean });
  if (!body.message || !body.message.trim()) {
    return c.json({ error: "message is required" }, 400);
  }
  const anonymous = body.anonymous ? 1 : 0;

  const result = await c.env.DB.prepare("INSERT INTO feedback (employee_id, message, anonymous) VALUES (?, ?, ?)")
    .bind(employee.id, body.message.trim(), anonymous)
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM feedback WHERE id = ?")
    .bind(result.meta.last_row_id)
    .first<Feedback>();
  return c.json(row);
});

app.get("/admin/feedback", requireFounder, async (c) => {
  // Mask the sender's name for anonymous feedback so it stays anonymous even
  // to founders (the name never leaves the database).
  const rows = await c.env.DB.prepare(
    `SELECT f.*, CASE WHEN f.anonymous = 1 THEN NULL ELSE e.name END AS employee_name
     FROM feedback f
     JOIN employees e ON e.id = f.employee_id
     ORDER BY f.created_at DESC`
  ).all<FeedbackWithName>();
  return c.json(rows.results);
});

app.delete("/admin/feedback/:id", requireFounder, async (c) => {
  const id = Number(c.req.param("id"));
  if (Number.isNaN(id)) return c.json({ error: "Invalid feedback id" }, 400);

  const existing = await c.env.DB.prepare("SELECT id FROM feedback WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "Feedback not found" }, 404);

  await c.env.DB.prepare("DELETE FROM feedback WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

export default app;
