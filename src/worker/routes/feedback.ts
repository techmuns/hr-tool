import { Hono } from "hono";
import type { AppEnv } from "../auth";
import { requireEmployee, requireFounder } from "../auth";
import type { Feedback, FeedbackWithName } from "../types";

const app = new Hono<AppEnv>();

app.use("*", requireEmployee);

app.post("/feedback", async (c) => {
  const employee = c.get("employee");
  const body = await c.req.json<{ message?: string }>().catch(() => ({}) as { message?: string });
  if (!body.message || !body.message.trim()) {
    return c.json({ error: "message is required" }, 400);
  }

  const result = await c.env.DB.prepare("INSERT INTO feedback (employee_id, message) VALUES (?, ?)")
    .bind(employee.id, body.message.trim())
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM feedback WHERE id = ?")
    .bind(result.meta.last_row_id)
    .first<Feedback>();
  return c.json(row);
});

app.get("/admin/feedback", requireFounder, async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT f.*, e.name AS employee_name FROM feedback f
     JOIN employees e ON e.id = f.employee_id
     ORDER BY f.created_at DESC`
  ).all<FeedbackWithName>();
  return c.json(rows.results);
});

export default app;
