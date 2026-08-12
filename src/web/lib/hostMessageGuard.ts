// Pure validation helpers for messages arriving from the Munshot host iframe
// parent. Kept side-effect-free and separate from sdk.ts/useHostContext.ts so
// they're trivial to unit test without a DOM or a postMessage round trip.

import type { SessionContext } from "./sdk";

/**
 * `origin` is the exact scheme+host(+port) MessageEvent.origin the browser
 * reports for wherever the message actually came from — it cannot be spoofed
 * by the message's own content, only by controlling that origin. An empty
 * allow-list rejects everything: until the real Munshot origin(s) are
 * configured (VITE_MUNSHOT_ALLOWED_ORIGINS), no host message is trusted
 * enough to auto-authenticate a user.
 */
export function isTrustedOrigin(origin: string, allowedOrigins: readonly string[]): boolean {
  if (!origin || allowedOrigins.length === 0) return false;
  return allowedOrigins.includes(origin);
}

const MAX_EMAIL_LENGTH = 320; // RFC 5321 upper bound

/**
 * Structural check on the session payload a host:init/host:context:update
 * message claims to carry. Rejects anything that isn't a plausible email —
 * this is not email validation for its own sake, it's making sure a
 * malformed or hostile payload can't smuggle something unexpected into the
 * one field (`email`) this app actually acts on (see App.tsx, which logs
 * straight into that address).
 */
export function isValidSessionPayload(session: unknown): session is SessionContext {
  if (!session || typeof session !== "object") return false;
  const s = session as Record<string, unknown>;

  if (s.email !== null && s.email !== undefined) {
    if (typeof s.email !== "string") return false;
    if (s.email.length === 0 || s.email.length > MAX_EMAIL_LENGTH) return false;
    if (!s.email.includes("@")) return false;
  }
  if (s.token !== null && s.token !== undefined && typeof s.token !== "string") return false;
  if (s.userName !== null && s.userName !== undefined && typeof s.userName !== "string") return false;
  if (s.orgId !== null && s.orgId !== undefined && typeof s.orgId !== "string") return false;
  if (s.orgName !== null && s.orgName !== undefined && typeof s.orgName !== "string") return false;

  return true;
}
