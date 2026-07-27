// Server-verified identity primitives.
//
// Two kinds of bearer token are accepted by the API (see auth.ts):
//   1. A Munshot host JWT — verified against Munshot's key material. Identity
//      comes from the verified `email` claim.
//   2. An app-session token — minted by us (HS256, SESSION_SECRET) after a
//      successful email-OTP verification. Identity is the `sub` (employee id).
//
// Both are cryptographically verified. Nothing here ever trusts an unverified
// token: if no verification material is configured for the Munshot path, it
// fails closed (returns null) rather than decoding an unsigned identity.

import { SignJWT, jwtVerify, createRemoteJWKSet, importSPKI, type JWTPayload } from "jose";
import type { Bindings } from "./auth";

const APP_ISS = "hr-tool";
const APP_AUD = "hr-tool-app";
const SESSION_TTL = "12h";

function hmacKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/** Mint a short-lived app-session token for an employee (OTP path). */
export async function mintSessionToken(env: Bindings, employeeId: number): Promise<string> {
  if (!env.SESSION_SECRET) throw new Error("SESSION_SECRET is not configured");
  return await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(employeeId))
    .setIssuer(APP_ISS)
    .setAudience(APP_AUD)
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(hmacKey(env.SESSION_SECRET));
}

/** Verify an app-session token; returns the employee id or null. */
export async function verifySessionToken(env: Bindings, token: string): Promise<number | null> {
  if (!env.SESSION_SECRET) return null;
  try {
    const { payload } = await jwtVerify(token, hmacKey(env.SESSION_SECRET), {
      issuer: APP_ISS,
      audience: APP_AUD,
      algorithms: ["HS256"],
    });
    const id = Number(payload.sub);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

// Cache one remote JWKS resolver per URL (createRemoteJWKSet caches keys and
// handles rotation internally).
let jwksResolver: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksResolverUrl = "";
function getJwks(url: string) {
  if (!jwksResolver || jwksResolverUrl !== url) {
    jwksResolver = createRemoteJWKSet(new URL(url));
    jwksResolverUrl = url;
  }
  return jwksResolver;
}

const ASYMMETRIC_ALGS = ["RS256", "RS384", "RS512", "ES256", "ES384", "ES512"];

/**
 * Verify a Munshot host JWT and return the lower-cased `email` claim, or null
 * if the token is invalid/expired or no verification material is configured.
 *
 * Configure exactly one of (set via `wrangler secret put` / vars):
 *   - MUNSHOT_JWKS_URL        JWKS endpoint (asymmetric, supports rotation)
 *   - MUNSHOT_JWT_PUBLIC_KEY  PEM (SPKI) public key + optional MUNSHOT_JWT_ALG
 *   - MUNSHOT_JWT_SECRET      shared HMAC secret (HS256)
 * plus optional MUNSHOT_JWT_ISSUER / MUNSHOT_JWT_AUDIENCE claim checks.
 */
export async function verifyMunshotJwt(env: Bindings, token: string): Promise<string | null> {
  const claimOpts = {
    issuer: env.MUNSHOT_JWT_ISSUER || undefined,
    audience: env.MUNSHOT_JWT_AUDIENCE || undefined,
  };

  let payload: JWTPayload;
  try {
    if (env.MUNSHOT_JWKS_URL) {
      ({ payload } = await jwtVerify(token, getJwks(env.MUNSHOT_JWKS_URL), {
        ...claimOpts,
        algorithms: ASYMMETRIC_ALGS,
      }));
    } else if (env.MUNSHOT_JWT_PUBLIC_KEY) {
      const alg = env.MUNSHOT_JWT_ALG || "RS256";
      const key = await importSPKI(env.MUNSHOT_JWT_PUBLIC_KEY, alg);
      ({ payload } = await jwtVerify(token, key, { ...claimOpts, algorithms: [alg] }));
    } else if (env.MUNSHOT_JWT_SECRET) {
      ({ payload } = await jwtVerify(token, hmacKey(env.MUNSHOT_JWT_SECRET), {
        ...claimOpts,
        algorithms: ["HS256"],
      }));
    } else {
      // Fail closed: no way to verify, so we refuse to trust the token.
      console.error("[auth] Munshot JWT verification is not configured; rejecting token");
      return null;
    }
  } catch {
    return null;
  }

  const email =
    typeof payload.email === "string"
      ? payload.email
      : typeof payload.sub === "string" && payload.sub.includes("@")
        ? payload.sub
        : null;
  return email ? email.trim().toLowerCase() : null;
}
