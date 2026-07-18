import { Hono } from "hono";
import type { AppEnv } from "../auth";
import { requireAdmin, requireEmployee } from "../auth";
import type { Employee, LeaveRequest, Payroll, WorkMode } from "../types";

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

// Full profile for one employee: their record plus leaves and payroll history.
app.get("/admin/employees/:id/detail", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const employee = await c.env.DB.prepare("SELECT * FROM employees WHERE id = ?").bind(id).first<Employee>();
  if (!employee) return c.json({ error: "Employee not found" }, 404);

  const leaves = await c.env.DB.prepare(
    "SELECT * FROM leave_requests WHERE employee_id = ? ORDER BY start_date DESC"
  )
    .bind(id)
    .all<LeaveRequest>();
  const payroll = await c.env.DB.prepare("SELECT * FROM payroll WHERE employee_id = ? ORDER BY period DESC")
    .bind(id)
    .all<Payroll>();

  return c.json({ employee, leaves: leaves.results, payroll: payroll.results });
});

interface EmployeeWriteBody {
  name?: string;
  email?: string;
  location?: string;
  work_mode?: WorkMode;
  date_of_joining?: string;
  monthly_salary?: number;
}

function normalizeWorkMode(value: unknown, fallback: WorkMode): WorkMode {
  return value === "wfh" || value === "in-office" ? value : fallback;
}

app.post("/employees", requireAdmin, async (c) => {
  const body = await c.req.json<EmployeeWriteBody>().catch(() => ({}) as EmployeeWriteBody);

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return c.json({ error: "Name is required" }, 400);

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const location = typeof body.location === "string" ? body.location.trim() : "";
  const work_mode = normalizeWorkMode(body.work_mode, "in-office");
  const date_of_joining =
    typeof body.date_of_joining === "string" && body.date_of_joining
      ? body.date_of_joining
      : new Date().toISOString().slice(0, 10);
  const monthly_salary =
    typeof body.monthly_salary === "number" && Number.isFinite(body.monthly_salary) ? body.monthly_salary : 0;

  const result = await c.env.DB.prepare(
    `INSERT INTO employees (name, email, location, work_mode, date_of_joining, role, monthly_salary)
     VALUES (?, ?, ?, ?, ?, 'employee', ?)`
  )
    .bind(name, email, location, work_mode, date_of_joining, monthly_salary)
    .run();

  const created = await c.env.DB.prepare("SELECT * FROM employees WHERE id = ?")
    .bind(result.meta.last_row_id)
    .first<Employee>();
  return c.json(created, 201);
});

app.patch("/employees/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await c.env.DB.prepare("SELECT * FROM employees WHERE id = ?").bind(id).first<Employee>();
  if (!existing) return c.json({ error: "Employee not found" }, 404);

  const body = await c.req.json<EmployeeWriteBody>().catch(() => ({}) as EmployeeWriteBody);

  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : existing.name;
  const email = typeof body.email === "string" ? body.email.trim() : existing.email;
  const location = typeof body.location === "string" ? body.location.trim() : existing.location;
  const work_mode = normalizeWorkMode(body.work_mode, existing.work_mode);
  const date_of_joining =
    typeof body.date_of_joining === "string" && body.date_of_joining ? body.date_of_joining : existing.date_of_joining;
  const monthly_salary =
    typeof body.monthly_salary === "number" && Number.isFinite(body.monthly_salary)
      ? body.monthly_salary
      : existing.monthly_salary;

  await c.env.DB.prepare(
    "UPDATE employees SET name = ?, email = ?, location = ?, work_mode = ?, date_of_joining = ?, monthly_salary = ? WHERE id = ?"
  )
    .bind(name, email, location, work_mode, date_of_joining, monthly_salary, id)
    .run();

  const updated = await c.env.DB.prepare("SELECT * FROM employees WHERE id = ?").bind(id).first<Employee>();
  return c.json(updated);
});

app.delete("/employees/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await c.env.DB.prepare("SELECT * FROM employees WHERE id = ?").bind(id).first<Employee>();
  if (!existing) return c.json({ error: "Employee not found" }, 404);
  if (existing.role === "admin") return c.json({ error: "Cannot remove an admin account" }, 400);

  await c.env.DB.prepare("DELETE FROM employees WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

export default app;
