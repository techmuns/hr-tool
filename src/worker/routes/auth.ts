import { Hono } from "hono";
import type { AppEnv } from "../auth";
import { sendRawEmail } from "../email";
import type { Employee } from "../types";

const app = new Hono<AppEnv>();

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

export default app;
