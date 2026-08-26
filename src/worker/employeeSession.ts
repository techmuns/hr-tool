import type { Employee } from "./types";
import { randomToken, sha256Hex } from "./tokens";

/**
 * Opaque, server-verified session tokens for the base (employee) identity.
 *
 * This is the fix for the impersonation hole: the client used to declare who it
 * was with an `x-user-id` header sourced from a plaintext localStorage object,
 * so anyone could edit that id (or send a different header) and be served as
 * another employee. Now a login issues a random token, the server stores only
 * its hash (see ./tokens.ts), and every request resolves the real employee by
 * looking the token up here. A tampered/guessed token simply doesn't match, so
 * it can never resolve to someone else — it just falls back to login.
 *
 * Mirrors ./adminSession.ts, minus the cookie plumbing: the base session
 * travels as an `Authorization: Bearer <token>` header so the browser app and
 * the Chrome extension share one mechanism.
 */

// Base identity, unlike the privileged admin session (6h), is not itself a
// capability to do anything sensitive — every privileged action is gated
// separately (admin cookie / role checks). So this leans toward "stay signed
// in" rather than frequent re-auth: long enough that people aren't re-running
// the email OTP every day, bounded so an abandoned token doesn't live forever.
const EMPLOYEE_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

/** Issue a new session token for an employee and persist only its hash. */
export async function createEmployeeSession(db: D1Database, employeeId: number): Promise<string> {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + EMPLOYEE_SESSION_TTL_SECONDS * 1000).toISOString();

  await db
    .prepare("INSERT INTO employee_sessions (token_hash, employee_id, expires_at) VALUES (?, ?, ?)")
    .bind(tokenHash, employeeId, expiresAt)
    .run();
  // Opportunistic cleanup so the table doesn't grow unbounded — every login is a
  // natural chance to sweep whatever's already expired, no cron needed.
  await db.prepare("DELETE FROM employee_sessions WHERE expires_at <= ?").bind(new Date().toISOString()).run();

  return token;
}

/**
 * Resolve a bearer token to the employee it was issued for, or null. Re-reads
 * the employee row fresh from D1 every call — role and tier come from the
 * database, never from anything the client sent — so a change (or deletion)
 * takes effect immediately and the client can never assert its own privileges.
 */
export async function getEmployeeSessionEmployee(db: D1Database, token: string | undefined): Promise<Employee | null> {
  if (!token) return null;

  const tokenHash = await sha256Hex(token);
  const employee = await db
    .prepare(
      `SELECT e.* FROM employee_sessions s
         JOIN employees e ON e.id = s.employee_id
        WHERE s.token_hash = ? AND s.expires_at > ?`
    )
    .bind(tokenHash, new Date().toISOString())
    .first<Employee>();

  return employee ?? null;
}

/** Revoke a single session token (logout). No-op if it doesn't exist. */
export async function revokeEmployeeSession(db: D1Database, token: string | undefined): Promise<void> {
  if (!token) return;
  const tokenHash = await sha256Hex(token);
  await db.prepare("DELETE FROM employee_sessions WHERE token_hash = ?").bind(tokenHash).run();
}

/** Pull the raw bearer token out of an Authorization header, if present. */
export function bearerToken(authorization: string | undefined): string | undefined {
  if (!authorization) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match ? match[1].trim() : undefined;
}
