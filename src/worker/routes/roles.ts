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

app.patch("/admin/roles/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await c.env.DB.prepare("SELECT * FROM roles WHERE id = ?").bind(id).first<Role>();
  if (!existing) return c.json({ error: "Role not found" }, 404);

  const body = await c.req.json<{ name?: string }>().catch(() => ({}) as { name?: string });
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return c.json({ error: "Role name is required" }, 400);

  const dupe = await c.env.DB.prepare("SELECT id FROM roles WHERE name = ? AND id != ?").bind(name, id).first();
  if (dupe) return c.json({ error: "A role with that name already exists" }, 400);

  // job_title is stored as free text on employees, not a role_id FK, so the
  // rename has to be propagated to every employee currently holding the old
  // title. Batch both writes so they land atomically.
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE roles SET name = ? WHERE id = ?").bind(name, id),
    c.env.DB.prepare("UPDATE employees SET job_title = ? WHERE job_title = ?").bind(name, existing.name),
  ]);
  const updated = await c.env.DB.prepare("SELECT * FROM roles WHERE id = ?").bind(id).first<Role>();
  return c.json(updated);
});

app.delete("/admin/roles/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await c.env.DB.prepare("SELECT id FROM roles WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "Role not found" }, 404);

  await c.env.DB.prepare("DELETE FROM roles WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

export default app;
