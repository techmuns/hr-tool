import type { EmployeeRole, Tier } from "./types";

const KEY = "hr.session";

export interface Session {
  role: EmployeeRole;
  employeeId: number;
  tier: Tier;
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
