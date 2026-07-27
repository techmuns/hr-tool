import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../auth";
import { sendRawEmail } from "../email";
import { mintSessionToken } from "../tokens";
import { rateLimit } from "../ratelimit";
import type { Employee } from "../types";

const app = new Hono<AppEnv>();

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_OTP_ATTEMPTS = 5;
const HOUR_MS = 60 * 60 * 1000;

/** Cryptographically-random 6-digit code, zero-padded. */
function generateOtp(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, "0");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison (equal-length hex hashes). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function clientKey(c: Context<AppEnv>): string {
  return c.req.header("CF-Connecting-IP") || c.req.header("x-forwarded-for") || "unknown";
}

/**
 * Step 1 of email login / device connect: email a one-time code to an employee.
 * Responds identically whether or not the address maps to an account, so it is
 * not an account-enumeration oracle. Rate limited per IP and per email.
 */
app.post("/auth/request-otp", async (c) => {
  const body = await c.req.json<{ email?: string }>().catch(() => ({}) as { email?: string });
  const email = (body.email ?? "").trim().toLowerCase();
  const generic = c.json({ ok: true, message: "If that account exists, a verification code has been sent." });

  if (!email.includes("@")) {
    return c.json({ error: "Enter a valid email" }, 400);
  }

  const ipOk = await rateLimit(c.env, "otp-request-ip", clientKey(c), 20, HOUR_MS);
  const emailOk = await rateLimit(c.env, "otp-request-email", email, 5, HOUR_MS);
  if (!ipOk || !emailOk) {
    return c.json({ error: "Too many requests. Please try again later." }, 429);
  }

  const employee = await c.env.DB.prepare("SELECT * FROM employees WHERE lower(email) = ?")
    .bind(email)
    .first<Employee>();
  if (!employee) return generic; // do not reveal whether the account exists

  const code = generateOtp();
  const codeHash = await sha256Hex(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

  // Only one active code per email at a time.
  await c.env.DB.prepare("DELETE FROM email_otps WHERE email = ?").bind(email).run();
  await c.env.DB.prepare("INSERT INTO email_otps (email, code_hash, expires_at) VALUES (?, ?, ?)")
    .bind(email, codeHash, expiresAt)
    .run();

  try {
    await sendRawEmail(c.env, {
      email: employee.email,
      subject: "Your HR tool verification code",
      text: `Hi ${employee.name},\n\nYour verification code is ${code}.\nIt expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.`,
    });
  } catch (err) {
    // Log server-side but still return the generic response, so a send failure
    // (or outage) can't be used to distinguish real accounts from unknown ones.
    console.error("[otp] email send failed:", err instanceof Error ? err.message : err);
  }

  return generic;
});

/**
 * Step 2: verify the code and issue a signed app-session token. The token — not
 * a raw employee id — is what the client subsequently sends as a bearer.
 * Codes are hashed at rest, single-use, and locked out after MAX_OTP_ATTEMPTS
 * wrong guesses. Rate limited per IP and per email.
 */
app.post("/auth/verify-otp", async (c) => {
  const body = await c.req
    .json<{ email?: string; code?: string }>()
    .catch(() => ({}) as { email?: string; code?: string });
  const email = (body.email ?? "").trim().toLowerCase();
  const code = (body.code ?? "").trim();
  if (!email || !code) {
    return c.json({ error: "Email and code are required" }, 400);
  }

  const ipOk = await rateLimit(c.env, "otp-verify-ip", clientKey(c), 30, HOUR_MS);
  const emailOk = await rateLimit(c.env, "otp-verify-email", email, 15, HOUR_MS);
  if (!ipOk || !emailOk) {
    return c.json({ error: "Too many attempts. Please try again later." }, 429);
  }

  const invalid = () => c.json({ error: "Invalid or expired code" }, 401);

  const row = await c.env.DB.prepare(
    "SELECT id, code_hash, attempts FROM email_otps WHERE email = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1",
  )
    .bind(email, new Date().toISOString())
    .first<{ id: number; code_hash: string; attempts: number }>();
  if (!row) return invalid();

  const providedHash = await sha256Hex(code);
  if (!timingSafeEqual(providedHash, row.code_hash)) {
    const attempts = row.attempts + 1;
    if (attempts >= MAX_OTP_ATTEMPTS) {
      // Burn the code entirely once the attempt budget is exhausted.
      await c.env.DB.prepare("DELETE FROM email_otps WHERE email = ?").bind(email).run();
    } else {
      await c.env.DB.prepare("UPDATE email_otps SET attempts = ? WHERE id = ?").bind(attempts, row.id).run();
    }
    return invalid();
  }

  // Single-use: burn all codes for this email once one is accepted.
  await c.env.DB.prepare("DELETE FROM email_otps WHERE email = ?").bind(email).run();

  const employee = await c.env.DB.prepare("SELECT * FROM employees WHERE lower(email) = ?")
    .bind(email)
    .first<Employee>();
  if (!employee) return invalid();

  const token = await mintSessionToken(c.env, employee.id);
  return c.json({ token, role: employee.role, employee });
});

export default app;
