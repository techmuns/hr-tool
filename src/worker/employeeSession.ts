import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import type { AppEnv } from "./auth";
import type { Employee } from "./types";
import { randomSessionToken, sha256Hex } from "./sessionToken";

export const EMPLOYEE_SESSION_COOKIE = "hr_session";

// The base session for daily use (clock in/out, chat, leave, payslips) — long
// enough that nobody re-authenticates mid-workday or over a weekend, bounded
// enough that a leaked cookie/device token doesn't stay live forever the way
// the old, never-expiring localStorage/chrome.storage identity did. Re-issued
// fresh on every /login or /auth/verify-otp, so normal use never notices it.
const EMPLOYEE_SESSION_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days

/**
 * Issues a new session row and returns the raw (unhashed) token — the only
 * time it's ever available outside a cookie. Callers either set it as the
 * hr_session cookie (web app) or hand the raw value back in a JSON response
 * for a caller to store itself (the Chrome extension, which can't rely on
 * the browser's own cookie jar the way a same-origin page can — see
 * extension/background.js).
 */
export async function createEmployeeSession(db: D1Database, employeeId: number): Promise<string> {
  const token = randomSessionToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + EMPLOYEE_SESSION_TTL_SECONDS * 1000).toISOString();

  await db
    .prepare("INSERT INTO employee_sessions (token_hash, employee_id, expires_at) VALUES (?, ?, ?)")
    .bind(tokenHash, employeeId, expiresAt)
    .run();
  // Opportunistic cleanup so the table doesn't grow unbounded — no cron needed
  // since every login is a natural chance to sweep whatever's already expired.
  await db.prepare("DELETE FROM employee_sessions WHERE expires_at <= ?").bind(new Date().toISOString()).run();

  return token;
}

export function setEmployeeSessionCookie(c: Context<AppEnv>, token: string): void {
  setCookie(c, EMPLOYEE_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    // The dashboard runs inside a Munshot iframe, so from the browser's
    // perspective every request to this API is cross-site — SameSite=Lax/Strict
    // would silently drop the cookie. `partitioned` (CHIPS) keeps it working
    // under third-party-cookie-blocking browsers that still honor partitioned
    // storage.
    sameSite: "None",
    partitioned: true,
    path: "/",
    maxAge: EMPLOYEE_SESSION_TTL_SECONDS,
  });
}

export function clearEmployeeSessionCookie(c: Context<AppEnv>): void {
  deleteCookie(c, EMPLOYEE_SESSION_COOKIE, { path: "/", secure: true, sameSite: "None" });
}

function bearerToken(c: Context<AppEnv>): string | null {
  const header = c.req.header("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

/** The token this request presented, from whichever of the two channels carried it. */
function presentedToken(c: Context<AppEnv>): string | null {
  return bearerToken(c) ?? getCookie(c, EMPLOYEE_SESSION_COOKIE) ?? null;
}

/**
 * The one place a request turns into a verified identity — replaces every
 * former read of the x-user-id / x-role headers. Accepts the session token
 * from either an `Authorization: Bearer` header (the Chrome extension) or
 * the hr_session cookie (the web app); both are checked against the same
 * server-tracked table, so neither can be edited into a *different* identity
 * the way the old headers could — altering either just invalidates it.
 * Always re-reads the employee row fresh from D1, so a role change takes
 * effect on the very next request without needing to touch the session.
 */
export async function getEmployeeSessionEmployee(c: Context<AppEnv>): Promise<Employee | null> {
  const token = presentedToken(c);
  if (!token) return null;

  const tokenHash = await sha256Hex(token);
  const employee = await c.env.DB.prepare(
    `SELECT e.* FROM employee_sessions s
       JOIN employees e ON e.id = s.employee_id
      WHERE s.token_hash = ? AND s.expires_at > ?`
  )
    .bind(tokenHash, new Date().toISOString())
    .first<Employee>();

  return employee ?? null;
}

export async function revokeEmployeeSession(c: Context<AppEnv>): Promise<void> {
  const token = presentedToken(c);
  if (token) {
    const tokenHash = await sha256Hex(token);
    await c.env.DB.prepare("DELETE FROM employee_sessions WHERE token_hash = ?").bind(tokenHash).run();
  }
  clearEmployeeSessionCookie(c);
}
