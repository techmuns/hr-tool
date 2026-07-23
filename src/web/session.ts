import type { EmployeeRole, Tier } from "./types";

export interface Session {
  role: EmployeeRole;
  employeeId: number;
  tier: Tier;
  // The host-asserted email (from the Munshot JWT) this session was resolved
  // for. Held in memory only, never persisted — identity always comes fresh
  // from the host on each load, so a session for one person can never leak
  // into another person's browser/tab/session.
  email: string;
}

let current: Session | null = null;

export function getSession(): Session | null {
  return current;
}

export function setSession(session: Session): void {
  current = session;
}

export function clearSession(): void {
  current = null;
}
