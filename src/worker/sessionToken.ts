/**
 * Shared primitives for every server-issued session token in this app
 * (admin_sessions, employee_sessions). Kept in one place so the two session
 * modules can't drift into different token formats or hashing schemes.
 */

/** Cryptographically-random, cookie/header-safe opaque session token. */
export function randomSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  // base64url: no padding, no +/ characters, so it's cookie- and header-safe as-is.
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Only the SHA-256 of a session token is ever stored — a read of the sessions
 * table (backup, D1 console) can't be replayed as a live session, same
 * reasoning as never storing a password itself.
 */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
