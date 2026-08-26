import type { EmployeeRole, Tier } from "./types";

// localStorage now holds ONLY an opaque, server-issued session token — a random
// string that reveals nothing and can't be edited into someone else's identity
// (the server resolves the real employee from it; a changed character just
// stops matching). The old value here was `{role, employeeId, tier}` in plain
// text, which is exactly what let people swap the id and be served as another
// employee. Who the user actually is (for rendering) is resolved from the
// server after login and kept in memory below, never persisted.
const TOKEN_KEY = "hr.session";

export interface Session {
  role: EmployeeRole;
  employeeId: number;
  tier: Tier;
}

// In-memory identity for the UI (which screen to show, founder-only bits, etc.).
// Deliberately NOT persisted: it's a rendering hint, never a credential, and
// keeping it out of storage means there's nothing there to read or tamper with.
// The server never trusts it — every request is authorized by the token alone.
let identity: Session | null = null;

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage disabled (private mode etc.) — the in-memory identity still works for this tab */
  }
}

/** The current identity for UI purposes, or null if not resolved yet. */
export function getSession(): Session | null {
  return identity;
}

/** Set the in-memory identity (from a login response or the /auth/session whoami). */
export function setSession(session: Session | null): void {
  identity = session;
}

export function clearSession(): void {
  identity = null;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nothing persisted to clear */
  }
}
