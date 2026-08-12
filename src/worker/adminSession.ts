import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import type { AppEnv } from "./auth";
import type { Employee } from "./types";

export const ADMIN_SESSION_COOKIE = "admin_session";
// Within the 4-8h window asked for: long enough that HR doesn't re-enter a
// password every few minutes, short enough that a leaked/left-open session
// doesn't stay live for days.
const ADMIN_SESSION_TTL_SECONDS = 6 * 60 * 60;

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  // base64url: no padding, no +/ characters, so it's cookie-safe as-is.
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Only the SHA-256 of the session token is ever stored — same reasoning as
 * hashing passwords. A read of the admin_sessions table (backup, D1 console)
 * can't be replayed as a live cookie.
 */
export async function createAdminSession(db: D1Database, employeeId: number): Promise<string> {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000).toISOString();

  await db
    .prepare("INSERT INTO admin_sessions (token_hash, employee_id, expires_at) VALUES (?, ?, ?)")
    .bind(tokenHash, employeeId, expiresAt)
    .run();
  // Opportunistic cleanup so the table doesn't grow unbounded — no cron needed
  // since every login is a natural chance to sweep whatever's already expired.
  await db.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").bind(new Date().toISOString()).run();

  return token;
}

export function setAdminSessionCookie(c: Context<AppEnv>, token: string): void {
  setCookie(c, ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    // The dashboard runs inside a Munshot iframe, so from the browser's
    // perspective every request to this API is cross-site — SameSite=Lax/Strict
    // would silently drop the cookie. `partitioned` (CHIPS) keeps it working
    // under third-party-cookie-blocking browsers that still honor partitioned
    // storage; see the security-review notes on browsers that support neither.
    sameSite: "None",
    partitioned: true,
    path: "/",
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  });
}

export function clearAdminSessionCookie(c: Context<AppEnv>): void {
  deleteCookie(c, ADMIN_SESSION_COOKIE, { path: "/", secure: true, sameSite: "None" });
}

/**
 * The one place that turns a request into a verified privileged identity.
 * Re-reads the employee row fresh from D1 on every call — never trusts
 * anything cached client-side — and re-checks `role` at read time so a
 * demotion revokes access immediately, without needing to hunt down and
 * expire the session row explicitly.
 */
export async function getAdminSessionEmployee(c: Context<AppEnv>): Promise<Employee | null> {
  const token = getCookie(c, ADMIN_SESSION_COOKIE);
  if (!token) return null;

  const tokenHash = await sha256Hex(token);
  const employee = await c.env.DB.prepare(
    `SELECT e.* FROM admin_sessions s
       JOIN employees e ON e.id = s.employee_id
      WHERE s.token_hash = ? AND s.expires_at > ?`
  )
    .bind(tokenHash, new Date().toISOString())
    .first<Employee>();

  if (!employee || employee.role !== "admin") return null;
  return employee;
}

export async function revokeAdminSession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, ADMIN_SESSION_COOKIE);
  if (token) {
    const tokenHash = await sha256Hex(token);
    await c.env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(tokenHash).run();
  }
  clearAdminSessionCookie(c);
}
