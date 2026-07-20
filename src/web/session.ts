import type { EmployeeRole } from "./types";
import type { Tier } from "./hostAuth";

const KEY = "hr.session";

export interface Session {
  role: EmployeeRole;
  employeeId: number;
  tier?: Tier;
  // Set when this session was resolved automatically from the Munshot host
  // JWT, so a later standalone (non-iframe) load doesn't silently reuse it.
  viaHost?: boolean;
}

export function getSession(): Session | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function setSession(session: Session): void {
  localStorage.setItem(KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(KEY);
}
