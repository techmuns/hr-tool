import { Hono } from "hono";
import type { AppEnv } from "../auth";
import type { Employee } from "../types";

const app = new Hono<AppEnv>();

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

export default app;
