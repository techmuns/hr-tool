import { Hono } from "hono";
import type { AppEnv } from "../auth";
import { requireEmployee } from "../auth";
import {
  createAdminSession,
  getAdminSessionEmployee,
  revokeAdminSession,
  setAdminSessionCookie,
} from "../adminSession";
import { sendRawEmail } from "../email";
import { hashPassword, passwordStrengthError, verifyPassword } from "../password";
import type { Employee } from "../types";

const app = new Hono<AppEnv>();

/** Shape returned to the client after any successful login — never the raw DB row. */
function publicEmployee(employee: Employee) {
  return {
    id: employee.id,
    name: employee.name,
    email: employee.email,
    role: employee.role,
    tier: employee.tier,
  };
}

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Cryptographically-random 6-digit code, zero-padded. */
function generateOtp(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, "0");
}

app.post("/login", async (c) => {
  const body = await c.req.json<{ text?: string }>().catch(() => ({}) as { text?: string });
  const text = (body.text ?? "").trim().toLowerCase();

  if (text === "admin") {
    const admin = await c.env.DB.prepare(
      "SELECT * FROM employees WHERE role = 'admin' ORDER BY (tier = 'founder') DESC, id LIMIT 1"
    ).first<Employee>();
    if (!admin) return c.json({ error: "No admin account seeded" }, 500);
    const employees = await c.env.DB.prepare("SELECT * FROM employees ORDER BY id").all<Employee>();
    return c.json({ role: "admin", employee: admin, employees: employees.results });
  }

  if (text === "hr") {
    const hr = await c.env.DB.prepare("SELECT * FROM employees WHERE tier = 'hr' ORDER BY id LIMIT 1").first<Employee>();
    if (!hr) return c.json({ error: "No HR account yet — ask a founder to assign one" }, 500);
    return c.json({ role: "admin", employee: hr });
  }

  if (text === "employee") {
    const employee = await c.env.DB.prepare(
      "SELECT * FROM employees WHERE role = 'employee' ORDER BY id LIMIT 1"
    ).first<Employee>();
    if (!employee) return c.json({ error: "No employee account seeded" }, 500);
    return c.json({ role: "employee", employee });
  }

  if (text.includes("@")) {
    const employee = await c.env.DB.prepare("SELECT * FROM employees WHERE lower(email) = ?")
      .bind(text)
      .first<Employee>();
    if (!employee) return c.json({ error: "No account with that email" }, 404);
    return c.json({ role: employee.role, employee });
  }

  return c.json({ error: "Type 'admin', 'hr', 'employee', or your email to continue" }, 400);
});

/**
 * Step 1 of device (extension) connect: email a one-time code to an employee so
 * they can prove they own the address before the device acts on their behalf.
 */
app.post("/auth/request-otp", async (c) => {
  const body = await c.req.json<{ email?: string }>().catch(() => ({}) as { email?: string });
  const email = (body.email ?? "").trim().toLowerCase();
  if (!email.includes("@")) {
    return c.json({ error: "Enter a valid email" }, 400);
  }

  const employee = await c.env.DB.prepare("SELECT * FROM employees WHERE lower(email) = ?")
    .bind(email)
    .first<Employee>();
  if (!employee) {
    return c.json({ error: "No account with that email" }, 404);
  }

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

  // Only one active code per email at a time.
  await c.env.DB.prepare("DELETE FROM email_otps WHERE email = ?").bind(email).run();
  await c.env.DB.prepare("INSERT INTO email_otps (email, code, expires_at) VALUES (?, ?, ?)")
    .bind(email, code, expiresAt)
    .run();

  try {
    await sendRawEmail(c.env, {
      email: employee.email,
      subject: "Your HR tool verification code",
      text: `Hi ${employee.name},\n\nYour verification code is ${code}.\nIt expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not send verification email";
    return c.json({ error: message }, 502);
  }

  return c.json({ ok: true });
});

/**
 * Step 2: verify the code and return the same session payload as /login so the
 * device can start sending x-user-id / x-role on its requests.
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

  const match = await c.env.DB.prepare(
    "SELECT id FROM email_otps WHERE email = ? AND code = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1"
  )
    .bind(email, code, new Date().toISOString())
    .first<{ id: number }>();
  if (!match) {
    return c.json({ error: "Invalid or expired code" }, 401);
  }

  // Single-use: burn all codes for this email once one is accepted.
  await c.env.DB.prepare("DELETE FROM email_otps WHERE email = ?").bind(email).run();

  const employee = await c.env.DB.prepare("SELECT * FROM employees WHERE lower(email) = ?")
    .bind(email)
    .first<Employee>();
  if (!employee) {
    return c.json({ error: "No account with that email" }, 404);
  }

  return c.json({ role: employee.role, employee });
});

/**
 * Step 2 of privileged access: the base session above (OTP or Munshot-relayed
 * email, verified by requireEmployee) only proves "this is employee #N" — it
 * never grants HR/founder capability by itself. Deliberately takes NO
 * employee/email from the request body: the target account is always
 * `c.get("employee")`, i.e. whoever the verified base session says the caller
 * is, so this can only ever be used to authenticate as yourself, never to try
 * a password against someone else's account. A role='admin' employee proves
 * it's really them with a password only they know, and gets back a
 * short-lived, server-tracked session cookie (see adminSession.ts). Every
 * /admin/* route checks that cookie, never this endpoint's caller identity.
 */
app.post("/auth/admin-login", requireEmployee, async (c) => {
  const employee = c.get("employee");
  if (employee.role !== "admin") {
    return c.json({ error: "This account has no admin access" }, 403);
  }

  const body = await c.req.json<{ password?: string }>().catch(() => ({}) as { password?: string });
  const password = body.password ?? "";
  if (!password) return c.json({ error: "Password is required" }, 400);

  const credentials = await c.env.DB.prepare(
    "SELECT password_hash FROM employee_credentials WHERE employee_id = ?"
  )
    .bind(employee.id)
    .first<{ password_hash: string }>();
  if (!credentials) {
    return c.json({ error: "No admin password set yet", code: "no_password" }, 404);
  }

  const ok = await verifyPassword(password, credentials.password_hash);
  if (!ok) return c.json({ error: "Incorrect password" }, 401);

  const token = await createAdminSession(c.env.DB, employee.id);
  setAdminSessionCookie(c, token);
  return c.json({ ok: true, employee: publicEmployee(employee) });
});

app.post("/auth/admin-logout", async (c) => {
  await revokeAdminSession(c);
  return c.json({ ok: true });
});

/**
 * "Whoami" for the admin session cookie — HttpOnly, so the SPA has no other
 * way to know whether it's still (or already) live, including across a
 * reload. Always 200: "not authenticated" is a normal state here, not an
 * error.
 */
app.get("/auth/admin-session", async (c) => {
  const employee = await getAdminSessionEmployee(c);
  return c.json(employee ? { authenticated: true, employee: publicEmployee(employee) } : { authenticated: false });
});

/**
 * Bootstraps or resets a privileged user's OWN admin password. Gated on the
 * regular employee session (proof they own this email via OTP or the Munshot
 * host relay) rather than an existing admin session — otherwise a HR/founder
 * account with no password set yet could never create one. `employee_id`
 * always comes from the verified session, never the request body, so this can
 * only ever touch the caller's own account.
 */
app.post("/auth/admin-password/set", requireEmployee, async (c) => {
  const employee = c.get("employee");
  if (employee.role !== "admin") {
    return c.json({ error: "Only HR/founder accounts have an admin password" }, 403);
  }

  const body = await c.req.json<{ password?: string }>().catch(() => ({}) as { password?: string });
  const password = body.password ?? "";
  const strengthError = passwordStrengthError(password);
  if (strengthError) return c.json({ error: strengthError }, 400);

  const hash = await hashPassword(password);
  await c.env.DB.prepare(
    `INSERT INTO employee_credentials (employee_id, password_hash, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT (employee_id) DO UPDATE SET password_hash = excluded.password_hash, updated_at = excluded.updated_at`
  )
    .bind(employee.id, hash)
    .run();

  // A password change invalidates any sessions issued under the old one —
  // otherwise a compromised session would survive the fix meant to kill it.
  await c.env.DB.prepare("DELETE FROM admin_sessions WHERE employee_id = ?").bind(employee.id).run();

  return c.json({ ok: true });
});

export default app;
