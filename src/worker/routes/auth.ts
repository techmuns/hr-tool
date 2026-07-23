import { Hono } from "hono";
import type { AppEnv } from "../auth";
import type { Employee } from "../types";

const app = new Hono<AppEnv>();

// Resolves the employee for the email the Munshot host asserts for the
// current user (session.email from the host JWT — see useHostContext). This
// is the only identity input: there is no separate username/password or
// role-selection flow, so a request here can only ever resolve to the
// account matching the caller's host-asserted email.
app.post("/login", async (c) => {
  const body = await c.req.json<{ email?: string }>().catch(() => ({}) as { email?: string });
  const email = (body.email ?? "").trim().toLowerCase();
  if (!email) return c.json({ error: "email is required" }, 400);

  const employee = await c.env.DB.prepare("SELECT * FROM employees WHERE lower(email) = ?")
    .bind(email)
    .first<Employee>();
  if (!employee) return c.json({ error: "No HR Tool account found for this email" }, 404);

  return c.json({ role: employee.role, employee });
});

export default app;
