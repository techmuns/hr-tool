import type { Context, Next } from "hono";
import type { Employee } from "./types";
import { getAdminSessionEmployee } from "./adminSession";

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

/**
 * Privileged (HR/founder) routes are gated on a real, server-issued admin
 * session (see adminSession.ts) — never on the x-user-id/x-role headers
 * requireEmployee trusts. Those headers are plain client-supplied values;
 * granting admin access off them would let anyone with devtools set
 * `x-role: admin` and reach every HR endpoint. The admin session cookie is
 * HttpOnly (unreadable to page JS) and only ever issued after a password
 * check, so this is independent of, and does not require, requireEmployee
 * having run first.
 */
export async function requireAdmin(c: Context<AppEnv>, next: Next) {
  const employee = await getAdminSessionEmployee(c);
  if (!employee) {
    return c.json({ error: "Admin session required", code: "admin_session_required" }, 401);
  }
  c.set("employee", employee);
  await next();
}

export async function requireFounder(c: Context<AppEnv>, next: Next) {
  const employee = await getAdminSessionEmployee(c);
  if (!employee || employee.tier !== "founder") {
    return c.json({ error: "Founder admin session required", code: "admin_session_required" }, 401);
  }
  c.set("employee", employee);
  await next();
}
