import { Hono } from "hono";
import type { AppEnv } from "../auth";
import { requireAdmin, requireEmployee } from "../auth";
import type { Holiday } from "../types";

const app = new Hono<AppEnv>();

app.use("*", requireEmployee);

// Anyone signed in can read the holiday list — it's calendar info everyone's
// attendance view needs, not privileged HR data. Only HR/admins can write it.
app.get("/holidays", async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM holidays ORDER BY work_date ASC").all<Holiday>();
  return c.json(rows.results);
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

app.post("/admin/holidays", requireAdmin, async (c) => {
  const body = await c.req
    .json<{ work_date?: string; name?: string }>()
    .catch(() => ({}) as { work_date?: string; name?: string });

  const workDate = typeof body.work_date === "string" ? body.work_date : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!DATE_RE.test(workDate)) return c.json({ error: "work_date (YYYY-MM-DD) is required" }, 400);
  if (!name) return c.json({ error: "name is required" }, 400);

  const editor = c.get("employee");
  await c.env.DB.prepare(
    `INSERT INTO holidays (work_date, name, created_by) VALUES (?, ?, ?)
     ON CONFLICT (work_date) DO UPDATE SET name = excluded.name`,
  )
    .bind(workDate, name, editor.id)
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM holidays WHERE work_date = ?").bind(workDate).first<Holiday>();
  return c.json(row);
});

app.delete("/admin/holidays/:date", requireAdmin, async (c) => {
  const date = c.req.param("date") ?? "";
  if (!DATE_RE.test(date)) return c.json({ error: "Invalid date" }, 400);

  await c.env.DB.prepare("DELETE FROM holidays WHERE work_date = ?").bind(date).run();
  return c.json({ ok: true });
});

export default app;
