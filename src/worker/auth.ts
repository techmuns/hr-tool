import type { Context, Next } from "hono";
import type { Employee } from "./types";
import { getEmployeeSessionEmployee } from "./employeeSession";

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
 * Identity comes from a server-issued, unguessable session token (see
 * employeeSession.ts) — never from anything the client merely asserts.
 * Previously this trusted a plain x-user-id header the client set from its
 * own localStorage, which meant editing devtools/localStorage was enough to
 * become any other employee; the session token can't be edited into a
 * different identity, only invalidated, because it's checked against a
 * server-side table rather than decoded from client-supplied data.
 */
export async function requireEmployee(c: Context<AppEnv>, next: Next) {
  const employee = await getEmployeeSessionEmployee(c);
  if (!employee) {
    return c.json({ error: "Not authenticated" }, 401);
  }
  c.set("employee", employee);
  await next();
}

/**
 * `employee` here already came from the server-verified session (see
 * requireEmployee above), so `role`/`tier` are trustworthy on their own —
 * unlike the old x-role header, there's no client-supplied value left to
 * double-check against.
 */
export async function requireAdmin(c: Context<AppEnv>, next: Next) {
  const employee = c.get("employee");
  if (!employee || employee.role !== "admin") {
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
