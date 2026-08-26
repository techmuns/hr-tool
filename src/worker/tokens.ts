/**
 * Shared primitives for opaque session tokens (admin and employee sessions).
 *
 * The raw token is what the client holds and sends back; only its SHA-256 is
 * ever written to the database, so a read of a sessions table can't be replayed
 * as a live session — same reasoning as never storing a password itself.
 */

/** A 256-bit cryptographically-random, URL/cookie-safe token (base64url, no padding). */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
