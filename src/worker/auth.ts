import type { Context, Next } from "hono";
import type { Employee } from "./types";
import { verifyMunshotJwt, verifySessionToken } from "./tokens";

export type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Bearer token for the Muns raw email API. Set via `wrangler secret put MUNS_TOKEN`. */
  MUNS_TOKEN: string;
  /** HMAC secret for app-session tokens (OTP path). `wrangler secret put SESSION_SECRET`. */
  SESSION_SECRET: string;
  // Munshot host JWT verification (configure one; see tokens.ts).
  MUNSHOT_JWKS_URL?: string;
  MUNSHOT_JWT_PUBLIC_KEY?: string;
  MUNSHOT_JWT_ALG?: string;
  MUNSHOT_JWT_SECRET?: string;
  MUNSHOT_JWT_ISSUER?: string;
  MUNSHOT_JWT_AUDIENCE?: string;
  /** Comma-separated origins allowed to call the API cross-site (CORS). */
  ALLOWED_ORIGINS?: string;
  /** CSP frame-ancestors value (space-separated Munshot host origins). */
  FRAME_ANCESTORS?: string;
};

export type Variables = {
  employee: Employee;
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };

function bearerToken(c: Context<AppEnv>): string | null {
  const header = c.req.header("Authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

/**
 * Authenticate the caller from a verified bearer token. Accepts either an
 * app-session token (OTP path) or a Munshot host JWT (embedded web path). The
 * loaded employee — and therefore its role/tier — always comes from the
 * database keyed by the *verified* identity, never from client-supplied values.
 */
export async function requireEmployee(c: Context<AppEnv>, next: Next) {
  const token = bearerToken(c);
  if (!token) return c.json({ error: "Not authenticated" }, 401);

  let employee: Employee | null = null;

  const employeeId = await verifySessionToken(c.env, token);
  if (employeeId !== null) {
    employee = await c.env.DB.prepare("SELECT * FROM employees WHERE id = ?")
      .bind(employeeId)
      .first<Employee>();
  } else {
    const email = await verifyMunshotJwt(c.env, token);
    if (email) {
      employee = await c.env.DB.prepare("SELECT * FROM employees WHERE lower(email) = ?")
        .bind(email)
        .first<Employee>();
    }
  }

  if (!employee) return c.json({ error: "Not authenticated" }, 401);
  c.set("employee", employee);
  await next();
}

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
