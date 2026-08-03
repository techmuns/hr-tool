import type { Context, Next } from "hono";
import type { Employee } from "./types";

export type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  /**
   * Reimbursement bill attachments — too large for D1. See ./bills.ts.
   * Paused: no R2 bucket bound right now (commented out in wrangler.jsonc),
   * so this is undefined at runtime despite the type. bills.ts checks for
   * that before touching it.
   */
  BILLS: R2Bucket | undefined;
  /** Bearer token for the Muns raw email API. Set via `wrangler secret put MUNS_TOKEN`. */
  MUNS_TOKEN: string;
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

export async function requireFounder(c: Context<AppEnv>, next: Next) {
  const employee = c.get("employee");
  if (!employee || employee.tier !== "founder") {
    return c.json({ error: "Founder access required" }, 403);
  }
  await next();
}
