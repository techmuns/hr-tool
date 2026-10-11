import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/worker/index";
import { syncPayroll } from "../src/worker/payrollCalc";
import { currentPeriod, previousPeriod } from "../src/worker/payslip";
import { seedEmployee, employeeAuthHeaders } from "./helpers";
import type { Employee } from "../src/worker/types";

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`https://hr.test${path}`, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

async function seedPayrollEmployee(salaryPaise: number): Promise<Employee> {
  const emp = await seedEmployee(env.DB);
  await env.DB.prepare("UPDATE employees SET monthly_salary = ? WHERE id = ?").bind(salaryPaise, emp.id).run();
  return { ...emp, monthly_salary: salaryPaise };
}

/** Insert an approved reimbursement with an explicit period and created_at. */
async function approvedReimbursement(opts: {
  employeeId: number;
  amount: number;
  period: string | null;
  createdAt: string;
}): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO reimbursements (employee_id, amount, note, status, percent, period, created_at)
     VALUES (?, ?, '', 'approved', 100, ?, ?)`,
  )
    .bind(opts.employeeId, opts.amount, opts.period, opts.createdAt)
    .run();
}

async function reimbursementFor(employeeId: number, period: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT reimbursements FROM payroll WHERE employee_id = ? AND period = ?",
  )
    .bind(employeeId, period)
    .first<{ reimbursements: number }>();
  return row?.reimbursements ?? 0;
}

describe("reimbursement cycle attribution by pinned period", () => {
  it("counts a reimbursement in its pinned period, not the cycle its created_at falls in", async () => {
    const emp = await seedPayrollEmployee(2_400_000);
    // Filed on the 11th (its created_at buckets into November), but pinned to
    // October — exactly the 'added Vipul's Oct expense on the 11th' case.
    await approvedReimbursement({
      employeeId: emp.id,
      amount: 50_000,
      period: "2026-10",
      createdAt: "2026-10-11 10:00:00",
    });

    await syncPayroll(env.DB, "2026-10");
    await syncPayroll(env.DB, "2026-11");

    expect(await reimbursementFor(emp.id, "2026-10")).toBe(50_000); // lands where pinned
    expect(await reimbursementFor(emp.id, "2026-11")).toBe(0); // not in the created_at cycle
  });

  it("falls back to the created_at window for a row with no pinned period (pre-0039 data)", async () => {
    const emp = await seedPayrollEmployee(2_400_000);
    // period NULL, created_at on 5 Oct → October cycle (11 Sep – 10 Oct).
    await approvedReimbursement({
      employeeId: emp.id,
      amount: 33_000,
      period: null,
      createdAt: "2026-10-05 10:00:00",
    });

    await syncPayroll(env.DB, "2026-10");
    await syncPayroll(env.DB, "2026-11");

    expect(await reimbursementFor(emp.id, "2026-10")).toBe(33_000);
    expect(await reimbursementFor(emp.id, "2026-11")).toBe(0);
  });

  it("HTTP: an admin-filed reimbursement pins to the period sent in the body", async () => {
    const hr = await seedEmployee(env.DB, { role: "admin", tier: "hr" });
    const emp = await seedPayrollEmployee(2_400_000);
    const headers = {
      ...(await employeeAuthHeaders(env.DB, hr)),
      "content-type": "application/json",
    };

    const res = await call(`/api/admin/employees/${emp.id}/reimbursements`, {
      method: "POST",
      headers,
      body: JSON.stringify({ amount: 75_000, note: "Oct travel", period: "2026-10" }),
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { period: string; status: string };
    expect(created.period).toBe("2026-10");
    expect(created.status).toBe("approved"); // HR filing IS the approval

    await syncPayroll(env.DB, "2026-10");
    expect(await reimbursementFor(emp.id, "2026-10")).toBe(75_000);
  });

  it("HTTP: rejects a malformed period", async () => {
    const hr = await seedEmployee(env.DB, { role: "admin", tier: "hr" });
    const emp = await seedPayrollEmployee(2_400_000);
    const headers = {
      ...(await employeeAuthHeaders(env.DB, hr)),
      "content-type": "application/json",
    };

    const res = await call(`/api/admin/employees/${emp.id}/reimbursements`, {
      method: "POST",
      headers,
      body: JSON.stringify({ amount: 1_000, period: "October" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /admin/payroll/default-period", () => {
  async function defaultPeriod(adminHeaders: HeadersInit): Promise<string> {
    const res = await call("/api/admin/payroll/default-period", { headers: adminHeaders });
    expect(res.status).toBe(200);
    return ((await res.json()) as { period: string }).period;
  }

  it("holds on the just-closed cycle while its dues are unpaid, then advances once paid", async () => {
    const hr = await seedEmployee(env.DB, { role: "admin", tier: "hr" });
    const headers = await employeeAuthHeaders(env.DB, hr);

    const active = currentPeriod();
    const justClosed = previousPeriod(active);

    // Clean slate for the just-closed cycle (seed data pins nothing here, but be
    // explicit so the test doesn't depend on today's date).
    await env.DB.prepare("DELETE FROM payroll WHERE period = ?").bind(justClosed).run();

    // Nothing generated for the just-closed cycle yet → land on the active one.
    expect(await defaultPeriod(headers)).toBe(active);

    // Generate the just-closed cycle (now has unpaid dues) → hold on it.
    const emp = await seedPayrollEmployee(2_400_000);
    await syncPayroll(env.DB, justClosed);
    expect(await reimbursementFor(emp.id, justClosed)).toBe(0); // row exists, unpaid
    expect(await defaultPeriod(headers)).toBe(justClosed);

    // Settle every row in the just-closed cycle → advance to the active one.
    await env.DB.prepare("UPDATE payroll SET paid_at = datetime('now') WHERE period = ?")
      .bind(justClosed)
      .run();
    expect(await defaultPeriod(headers)).toBe(active);
  });
});
