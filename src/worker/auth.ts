import type { Context, Next } from "hono";
import type { Employee } from "./types";

export type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
};

export type Variables = {
  employee: Employee;
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };

/**
 * Demo-grade identity: trusts x-user-id / x-role headers set by the client
 * from its logged-in session. No passwords, per product requirements.
 */
export async function requireEmployee(c: Context<AppEnv>, next: Next) {
  const userId = c.req.header("x-user-id");
  if (!userId || Number.isNaN(Number(userId))) {
    return c.json({ error: "Not authenticated" }, 401);
  }
  const employee = await c.env.DB.prepare("SELECT * FROM employees WHERE id = ?")
    .bind(Number(userId))
    .first<Employee>();
  if (!employee) {
    return c.json({ error: "Not authenticated" }, 401);
  }
  c.set("employee", employee);
  await next();
}

export async function requireAdmin(c: Context<AppEnv>, next: Next) {
  const employee = c.get("employee");
  const headerRole = c.req.header("x-role");
  if (!employee || employee.role !== "admin" || headerRole !== "admin") {
    return c.json({ error: "Admin access required" }, 403);
  }
  await next();
}
