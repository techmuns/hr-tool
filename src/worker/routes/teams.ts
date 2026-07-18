import { Hono } from "hono";
import type { AppEnv } from "../auth";
import { requireAdmin, requireEmployee } from "../auth";
import type { Team } from "../types";

const app = new Hono<AppEnv>();

app.use("*", requireEmployee, requireAdmin);

app.get("/admin/teams", async (c) => {
  const teams = await c.env.DB.prepare("SELECT * FROM teams ORDER BY name ASC").all<Team>();
  return c.json(teams.results);
});

app.post("/admin/teams", async (c) => {
  const body = await c.req.json<{ name?: string }>().catch(() => ({}) as { name?: string });
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return c.json({ error: "Team name is required" }, 400);

  const existing = await c.env.DB.prepare("SELECT id FROM teams WHERE name = ?").bind(name).first();
  if (existing) return c.json({ error: "A team with that name already exists" }, 400);

  const result = await c.env.DB.prepare("INSERT INTO teams (name) VALUES (?)").bind(name).run();
  const created = await c.env.DB.prepare("SELECT * FROM teams WHERE id = ?")
    .bind(result.meta.last_row_id)
    .first<Team>();
  return c.json(created, 201);
});

app.delete("/admin/teams/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await c.env.DB.prepare("SELECT id FROM teams WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "Team not found" }, 404);

  // unassign any employees on this team rather than relying on FK cascade behavior
  await c.env.DB.prepare("UPDATE employees SET team_id = NULL WHERE team_id = ?").bind(id).run();
  await c.env.DB.prepare("DELETE FROM teams WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

export default app;
