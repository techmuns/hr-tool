import { Hono } from "hono";
import type { AppEnv } from "../auth";
import { requireAdmin, requireEmployee } from "../auth";
import type { Role } from "../types";

const app = new Hono<AppEnv>();

app.use("*", requireEmployee, requireAdmin);

app.get("/admin/roles", async (c) => {
  const roles = await c.env.DB.prepare("SELECT * FROM roles ORDER BY name ASC").all<Role>();
  return c.json(roles.results);
});

app.post("/admin/roles", async (c) => {
  const body = await c.req.json<{ name?: string }>().catch(() => ({}) as { name?: string });
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return c.json({ error: "Role name is required" }, 400);

  const existing = await c.env.DB.prepare("SELECT id FROM roles WHERE name = ?").bind(name).first();
  if (existing) return c.json({ error: "A role with that name already exists" }, 400);

  const result = await c.env.DB.prepare("INSERT INTO roles (name) VALUES (?)").bind(name).run();
  const created = await c.env.DB.prepare("SELECT * FROM roles WHERE id = ?")
    .bind(result.meta.last_row_id)
    .first<Role>();
  return c.json(created, 201);
});

app.delete("/admin/roles/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await c.env.DB.prepare("SELECT id FROM roles WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "Role not found" }, 404);

  await c.env.DB.prepare("DELETE FROM roles WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

export default app;
