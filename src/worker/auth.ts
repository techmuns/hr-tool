import type { Context, Next } from "hono";
import type { Employee } from "./types";
import { bearerToken, getEmployeeSessionEmployee } from "./employeeSession";

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
 * Establishes the caller's identity from a server-issued session token.
 *
 * The identity is whichever employee the token was ISSUED for — resolved by
 * looking the token up server-side (see ./employeeSession.ts) — never anything
 * the client asserts about itself. That's the whole point: the old scheme read
 * the caller's id straight from an `x-user-id` header the client set from a
 * plaintext localStorage object, so editing that number (or sending any header)
 * impersonated anyone. A bearer token can't be forged into another employee's
 * identity: change a character and it stops matching a stored session, full
 * stop. `role`/`tier` likewise come from the fresh DB row, so the client can
 * never assert its own privileges.
 */
export async function requireEmployee(c: Context<AppEnv>, next: Next) {
  const token = bearerToken(c.req.header("authorization"));
  const employee = await getEmployeeSessionEmployee(c.env.DB, token);
  if (!employee) {
    return c.json({ error: "Not authenticated" }, 401);
  }
  c.set("employee", employee);
  await next();
}

export async function requireAdmin(c: Context<AppEnv>, next: Next) {
  // `employee` is already the verified, token-resolved identity from
  // requireEmployee, so its `role` is authoritative — there is no separate
  // client-supplied role header to second-guess (there used to be an `x-role`
  // check here, but a header the client sets is not a second factor).
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
