import type { SessionContext } from "./lib/sdk";

export type Tier = "employee" | "hr" | "founder";

// Tier is decided here, in code, from the Munshot host's authenticated
// email — not from anything the host sends us. Add/remove emails to
// change access.
const HR_EMAILS = ["akshatt151@gmail.com", "rdiya0315@gmail.com"];

const FOUNDER_EMAILS = ["nitish.chhabra.ds@gmail.com", "nitish@muns.io", "ceekay@muns.io"];

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

export function tierForEmail(email: string | null): Tier {
  if (!email) return "employee";
  const normalized = normalize(email);
  if (FOUNDER_EMAILS.some((e) => e.toLowerCase() === normalized)) return "founder";
  if (HR_EMAILS.some((e) => e.toLowerCase() === normalized)) return "hr";
  return "employee";
}

// Best-effort decode of the JWT payload segment, used only as a fallback
// when the host context doesn't already carry session.email directly.
// Not a signature check — the host is the authority; we just read the
// claim it handed us.
function decodeJwtEmail(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "="));
    const claims = JSON.parse(json) as { email?: string };
    return claims.email ?? null;
  } catch {
    return null;
  }
}

export function hostEmail(session: SessionContext): string | null {
  if (session.email) return session.email;
  if (session.token) return decodeJwtEmail(session.token);
  return null;
}
