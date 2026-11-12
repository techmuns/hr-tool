import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/worker/index";
import { employeeAuthHeaders, seedEmployee } from "./helpers";

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`https://hr.test${path}`, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

async function count(sql: string, id: number): Promise<number> {
  const row = await env.DB.prepare(sql).bind(id).first<{ n: number }>();
  return row?.n ?? 0;
}

describe("DELETE /api/employees/:id (directory Delete action)", () => {
  it("removes the employee and their history, but keeps generated documents", async () => {
    const admin = await seedEmployee(env.DB, { role: "admin", tier: "hr" });
    const target = await seedEmployee(env.DB);

    // Give them history in every table that cascades off employees(id), plus a
    // generated document (which must survive with its employee link nulled).
    await env.DB.batch([
      env.DB.prepare("INSERT INTO attendance (employee_id, work_date, status) VALUES (?, '2026-03-02', 'present')").bind(target.id),
      env.DB.prepare("INSERT INTO leave_requests (employee_id, start_date, end_date) VALUES (?, '2026-03-03', '2026-03-03')").bind(target.id),
      env.DB.prepare("INSERT INTO payroll (employee_id, period) VALUES (?, '2026-03')").bind(target.id),
      env.DB.prepare("INSERT INTO chat_messages (employee_id, sender_role, body) VALUES (?, 'employee', 'hi')").bind(target.id),
      env.DB.prepare("INSERT INTO feedback (employee_id, message) VALUES (?, 'ok')").bind(target.id),
      env.DB.prepare("INSERT INTO reimbursements (employee_id, amount) VALUES (?, 1000)").bind(target.id),
      env.DB.prepare("INSERT INTO documents (template_id, employee_id) VALUES ('lor', ?)").bind(target.id),
    ]);
    // Their own login session too — it must stop working once they're gone.
    const targetHeaders = await employeeAuthHeaders(env.DB, target);

    const res = await call(`/api/employees/${target.id}`, {
      method: "DELETE",
      headers: await employeeAuthHeaders(env.DB, admin),
    });
    expect(res.status).toBe(200);

    expect(await count("SELECT COUNT(*) AS n FROM employees WHERE id = ?", target.id)).toBe(0);
    for (const table of ["attendance", "leave_requests", "payroll", "chat_messages", "feedback", "reimbursements", "employee_sessions"]) {
      expect(await count(`SELECT COUNT(*) AS n FROM ${table} WHERE employee_id = ?`, target.id), table).toBe(0);
    }
    // The document outlives them; only its employee link is cleared.
    const doc = await env.DB.prepare("SELECT employee_id FROM documents WHERE template_id = 'lor' ORDER BY id DESC")
      .first<{ employee_id: number | null }>();
    expect(doc?.employee_id).toBeNull();

    expect((await call("/api/me", { headers: targetHeaders })).status).toBe(401);
  });

  it("refuses to delete an admin/HR/founder account", async () => {
    const admin = await seedEmployee(env.DB, { role: "admin", tier: "hr" });
    const otherAdmin = await seedEmployee(env.DB, { role: "admin", tier: "founder" });

    const res = await call(`/api/employees/${otherAdmin.id}`, {
      method: "DELETE",
      headers: await employeeAuthHeaders(env.DB, admin),
    });
    expect(res.status).toBe(400);
    expect(await count("SELECT COUNT(*) AS n FROM employees WHERE id = ?", otherAdmin.id)).toBe(1);
  });

  it("a plain employee cannot delete anyone", async () => {
    const emp = await seedEmployee(env.DB);
    const target = await seedEmployee(env.DB);

    const res = await call(`/api/employees/${target.id}`, {
      method: "DELETE",
      headers: await employeeAuthHeaders(env.DB, emp),
    });
    expect(res.status).toBe(403);
    expect(await count("SELECT COUNT(*) AS n FROM employees WHERE id = ?", target.id)).toBe(1);
  });
});
