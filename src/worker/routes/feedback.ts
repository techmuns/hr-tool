import { Hono } from "hono";
import type { AppEnv } from "../auth";
import { requireAdmin, requireEmployee } from "../auth";
import type { Feedback, FeedbackWithName } from "../types";

const app = new Hono<AppEnv>();

app.use("*", requireEmployee);

const MAX_FEEDBACK = 5000;

app.post("/feedback", async (c) => {
  const employee = c.get("employee");
  const body = await c.req.json<{ message?: string }>().catch(() => ({}) as { message?: string });
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return c.json({ error: "message is required" }, 400);
  }
  if (message.length > MAX_FEEDBACK) {
    return c.json({ error: `message must be at most ${MAX_FEEDBACK} characters` }, 400);
  }

  const result = await c.env.DB.prepare("INSERT INTO feedback (employee_id, message) VALUES (?, ?)")
    .bind(employee.id, message)
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM feedback WHERE id = ?")
    .bind(result.meta.last_row_id)
    .first<Feedback>();
  return c.json(row);
});

app.get("/admin/feedback", requireAdmin, async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT f.*, e.name AS employee_name FROM feedback f
     JOIN employees e ON e.id = f.employee_id
     ORDER BY f.created_at DESC`
  ).all<FeedbackWithName>();
  return c.json(rows.results);
});

export default app;
