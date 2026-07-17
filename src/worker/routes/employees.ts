import { Hono } from "hono";
import type { AppEnv } from "../auth";
import { requireAdmin, requireEmployee } from "../auth";
import type { Employee, WorkMode } from "../types";

const app = new Hono<AppEnv>();

app.use("*", requireEmployee);

app.get("/me", (c) => {
  return c.json(c.get("employee"));
});

app.patch("/me", async (c) => {
  const employee = c.get("employee");
  const body = await c
    .req.json<{ name?: string; location?: string }>()
    .catch(() => ({}) as { name?: string; location?: string });

  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : employee.name;
  const location = typeof body.location === "string" ? body.location.trim() : employee.location;

  await c.env.DB.prepare("UPDATE employees SET name = ?, location = ? WHERE id = ?")
    .bind(name, location, employee.id)
    .run();

  const updated = await c.env.DB.prepare("SELECT * FROM employees WHERE id = ?").bind(employee.id).first<Employee>();
  return c.json(updated);
});

app.get("/employees", requireAdmin, async (c) => {
  const employees = await c.env.DB.prepare("SELECT * FROM employees ORDER BY id").all<Employee>();
  return c.json(employees.results);
});

app.patch("/employees/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await c.env.DB.prepare("SELECT * FROM employees WHERE id = ?").bind(id).first<Employee>();
  if (!existing) return c.json({ error: "Employee not found" }, 404);

  type EmployeePatchBody = { work_mode?: WorkMode; date_of_joining?: string; monthly_salary?: number };
  const body = await c
    .req.json<EmployeePatchBody>()
    .catch(() => ({}) as EmployeePatchBody);

  const work_mode: WorkMode =
    body.work_mode === "wfh" || body.work_mode === "in-office" ? body.work_mode : existing.work_mode;
  const date_of_joining =
    typeof body.date_of_joining === "string" && body.date_of_joining ? body.date_of_joining : existing.date_of_joining;
  const monthly_salary =
    typeof body.monthly_salary === "number" && Number.isFinite(body.monthly_salary)
      ? body.monthly_salary
      : existing.monthly_salary;

  await c.env.DB.prepare(
    "UPDATE employees SET work_mode = ?, date_of_joining = ?, monthly_salary = ? WHERE id = ?"
  )
    .bind(work_mode, date_of_joining, monthly_salary, id)
    .run();

  const updated = await c.env.DB.prepare("SELECT * FROM employees WHERE id = ?").bind(id).first<Employee>();
  return c.json(updated);
});

export default app;
