import { Hono } from "hono";
import type { AppEnv } from "../auth";
import { requireAdmin, requireEmployee, requireFounder } from "../auth";
import type { Employee, EmployeeWithTeam, LeaveRequest, Payroll, Reimbursement, Tier, WorkMode } from "../types";

const app = new Hono<AppEnv>();

app.use("*", requireEmployee);

const MAX_NOTE = 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isUniqueViolation(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /UNIQUE constraint failed/i.test(msg);
}

app.get("/me", async (c) => {
  const employee = c.get("employee");
  const withTeam = await c.env.DB.prepare(
    `SELECT e.*, t.name AS team_name FROM employees e
     LEFT JOIN teams t ON t.id = e.team_id
     WHERE e.id = ?`
  )
    .bind(employee.id)
    .first<EmployeeWithTeam>();
  return c.json(withTeam);
});

app.get("/reimbursements/me", async (c) => {
  const employee = c.get("employee");
  const rows = await c.env.DB.prepare(
    "SELECT * FROM reimbursements WHERE employee_id = ? ORDER BY created_at DESC"
  )
    .bind(employee.id)
    .all<Reimbursement>();
  return c.json(rows.results);
});

app.post("/reimbursements", async (c) => {
  const employee = c.get("employee");
  const body = await c
    .req.json<{ amount?: number; note?: string }>()
    .catch(() => ({}) as { amount?: number; note?: string });

  if (typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount <= 0) {
    return c.json({ error: "amount must be a positive number" }, 400);
  }
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (note.length > MAX_NOTE) {
    return c.json({ error: `note must be at most ${MAX_NOTE} characters` }, 400);
  }

  const result = await c.env.DB.prepare(
    "INSERT INTO reimbursements (employee_id, amount, note) VALUES (?, ?, ?)"
  )
    .bind(employee.id, Math.round(body.amount), note)
    .run();

  const created = await c.env.DB.prepare("SELECT * FROM reimbursements WHERE id = ?")
    .bind(result.meta.last_row_id)
    .first<Reimbursement>();
  return c.json(created, 201);
});

app.get("/employees", requireAdmin, async (c) => {
  const employees = await c.env.DB.prepare(
    `SELECT e.*, t.name AS team_name FROM employees e
     LEFT JOIN teams t ON t.id = e.team_id
     ORDER BY e.id`
  ).all<EmployeeWithTeam>();
  return c.json(employees.results);
});

// Full profile for one employee: their record plus leaves, payroll, and reimbursement history.
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
  const reimbursements = await c.env.DB.prepare(
    "SELECT * FROM reimbursements WHERE employee_id = ? ORDER BY created_at DESC"
  )
    .bind(id)
    .all<Reimbursement>();

  return c.json({
    employee,
    leaves: leaves.results,
    payroll: payroll.results,
    reimbursements: reimbursements.results,
  });
});

app.post("/admin/employees/:id/reimbursements", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const employee = await c.env.DB.prepare("SELECT id FROM employees WHERE id = ?").bind(id).first();
  if (!employee) return c.json({ error: "Employee not found" }, 404);

  const body = await c
    .req.json<{ amount?: number; note?: string }>()
    .catch(() => ({}) as { amount?: number; note?: string });

  if (typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount <= 0) {
    return c.json({ error: "amount must be a positive number" }, 400);
  }
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (note.length > MAX_NOTE) {
    return c.json({ error: `note must be at most ${MAX_NOTE} characters` }, 400);
  }

  const result = await c.env.DB.prepare(
    "INSERT INTO reimbursements (employee_id, amount, note) VALUES (?, ?, ?)"
  )
    .bind(id, Math.round(body.amount), note)
    .run();

  const created = await c.env.DB.prepare("SELECT * FROM reimbursements WHERE id = ?")
    .bind(result.meta.last_row_id)
    .first<Reimbursement>();
  return c.json(created, 201);
});

app.delete("/admin/reimbursements/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await c.env.DB.prepare("SELECT id FROM reimbursements WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "Reimbursement not found" }, 404);

  await c.env.DB.prepare("DELETE FROM reimbursements WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

interface EmployeeWriteBody {
  name?: string;
  email?: string;
  location?: string;
  work_mode?: WorkMode;
  date_of_joining?: string;
  monthly_salary?: number;
  team_id?: number | null;
  job_title?: string;
}

function normalizeWorkMode(value: unknown, fallback: WorkMode): WorkMode {
  return value === "wfh" || value === "in-office" ? value : fallback;
}

function normalizeTeamId(value: unknown, fallback: number | null): number | null {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return fallback;
}

app.post("/employees", requireAdmin, async (c) => {
  const body = await c.req.json<EmployeeWriteBody>().catch(() => ({}) as EmployeeWriteBody);

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return c.json({ error: "Name is required" }, 400);

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (email && !EMAIL_RE.test(email)) return c.json({ error: "Invalid email address" }, 400);
  const location = typeof body.location === "string" ? body.location.trim() : "";
  const work_mode = normalizeWorkMode(body.work_mode, "in-office");
  const date_of_joining =
    typeof body.date_of_joining === "string" && body.date_of_joining
      ? body.date_of_joining
      : new Date().toISOString().slice(0, 10);
  const monthly_salary =
    typeof body.monthly_salary === "number" && Number.isFinite(body.monthly_salary) ? body.monthly_salary : 0;
  const team_id = normalizeTeamId(body.team_id, null);
  const job_title = typeof body.job_title === "string" ? body.job_title.trim() : "";

  let result;
  try {
    result = await c.env.DB.prepare(
      `INSERT INTO employees (name, email, location, work_mode, date_of_joining, role, monthly_salary, team_id, job_title)
       VALUES (?, ?, ?, ?, ?, 'employee', ?, ?, ?)`
    )
      .bind(name, email, location, work_mode, date_of_joining, monthly_salary, team_id, job_title)
      .run();
  } catch (err) {
    if (isUniqueViolation(err)) return c.json({ error: "An employee with that email already exists" }, 409);
    throw err;
  }

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
  if (email && !EMAIL_RE.test(email)) return c.json({ error: "Invalid email address" }, 400);
  const location = typeof body.location === "string" ? body.location.trim() : existing.location;
  const work_mode = normalizeWorkMode(body.work_mode, existing.work_mode);
  const date_of_joining =
    typeof body.date_of_joining === "string" && body.date_of_joining ? body.date_of_joining : existing.date_of_joining;
  const monthly_salary =
    typeof body.monthly_salary === "number" && Number.isFinite(body.monthly_salary)
      ? body.monthly_salary
      : existing.monthly_salary;
  const team_id = normalizeTeamId(body.team_id, existing.team_id);
  const job_title = typeof body.job_title === "string" ? body.job_title.trim() : existing.job_title;

  try {
    await c.env.DB.prepare(
      `UPDATE employees SET name = ?, email = ?, location = ?, work_mode = ?, date_of_joining = ?,
       monthly_salary = ?, team_id = ?, job_title = ? WHERE id = ?`
    )
      .bind(name, email, location, work_mode, date_of_joining, monthly_salary, team_id, job_title, id)
      .run();
  } catch (err) {
    if (isUniqueViolation(err)) return c.json({ error: "An employee with that email already exists" }, 409);
    throw err;
  }

  const updated = await c.env.DB.prepare("SELECT * FROM employees WHERE id = ?").bind(id).first<Employee>();
  return c.json(updated);
});

app.patch("/employees/:id/tier", requireFounder, async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await c.env.DB.prepare("SELECT * FROM employees WHERE id = ?").bind(id).first<Employee>();
  if (!existing) return c.json({ error: "Employee not found" }, 404);
  if (existing.tier === "founder") return c.json({ error: "Cannot change a founder's access" }, 400);

  const body = await c.req.json<{ tier?: Tier }>().catch(() => ({}) as { tier?: Tier });
  if (body.tier !== "employee" && body.tier !== "hr") {
    return c.json({ error: "tier must be 'employee' or 'hr'" }, 400);
  }
  const role = body.tier === "hr" ? "admin" : "employee";

  await c.env.DB.prepare("UPDATE employees SET tier = ?, role = ? WHERE id = ?")
    .bind(body.tier, role, id)
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
