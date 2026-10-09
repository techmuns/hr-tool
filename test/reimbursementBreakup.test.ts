import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/worker/index";
import { syncPayroll } from "../src/worker/payrollCalc";
import { payCycle } from "../src/worker/payslip";
import { seedEmployee, employeeAuthHeaders } from "./helpers";
import type { Employee } from "../src/worker/types";

const PERIOD = "2026-03";
const cycle = payCycle(PERIOD);

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

async function approvedReimbursement(employeeId: number, amount: number, percent: 50 | 100 = 100): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO reimbursements (employee_id, amount, note, status, percent, created_at) VALUES (?, ?, '', 'approved', ?, ?)",
  )
    .bind(employeeId, amount, percent, `${cycle.start} 10:00:00`)
    .run();
}

async function logBreakup(
  employeeId: number,
  entries: { label: string; amount: number; percent?: number; full?: boolean }[],
  fullReimbursement = false,
): Promise<void> {
  const total = entries.reduce((s, e) => s + e.amount, 0);
  await env.DB.prepare(
    `INSERT INTO reimbursement_breakups (employee_id, period, entries, total, full_reimbursement)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(employeeId, PERIOD, JSON.stringify(entries), total, fullReimbursement ? 1 : 0)
    .run();
}

async function payrollRow(employeeId: number): Promise<{ reimbursements: number; net_pay: number }> {
  const row = await env.DB.prepare("SELECT reimbursements, net_pay FROM payroll WHERE employee_id = ? AND period = ?")
    .bind(employeeId, PERIOD)
    .first<{ reimbursements: number; net_pay: number }>();
  if (!row) throw new Error("no payroll row");
  return row;
}

describe("reimbursement breakup + approved requests", () => {
  it("ADDS the breakup's reimbursed total to approved requests (does not override)", async () => {
    const emp = await seedPayrollEmployee(2_400_000); // ₹24,000
    await approvedReimbursement(emp.id, 50_000); // ₹500 approved request
    // ₹100 at 100% + ₹200 at 50% = 10000 + 10000 = 20000 paise reimbursed
    await logBreakup(emp.id, [
      { label: "Mon", amount: 10_000, percent: 100 },
      { label: "Tue", amount: 20_000, percent: 50 },
    ]);

    await syncPayroll(env.DB, PERIOD);

    const row = await payrollRow(emp.id);
    expect(row.reimbursements).toBe(50_000 + 20_000); // approved + breakup, stacked
    expect(row.net_pay).toBe(2_400_000 + 70_000);
  });

  it("respects each line's own percent - a 100% line is not halved", async () => {
    const emp = await seedPayrollEmployee(2_400_000);
    await logBreakup(emp.id, [{ label: "Full day", amount: 30_000, percent: 100 }]);

    await syncPayroll(env.DB, PERIOD);

    // The whole line is at 100%, so all ₹300 reaches pay - not ₹150.
    expect((await payrollRow(emp.id)).reimbursements).toBe(30_000);
  });

  it("reads last month's per-line `full` boolean shape (true=100%, false=50%)", async () => {
    const emp = await seedPayrollEmployee(2_400_000);
    // No `percent` — the old format. ₹100 full + ₹200 half = 10000 + 10000.
    await logBreakup(emp.id, [
      { label: "Mon", amount: 10_000, full: true },
      { label: "Tue", amount: 20_000, full: false },
    ]);

    await syncPayroll(env.DB, PERIOD);

    expect((await payrollRow(emp.id)).reimbursements).toBe(20_000);
  });

  it("applies each approved request's own percent (50% halves just that request)", async () => {
    const emp = await seedPayrollEmployee(2_400_000);
    await approvedReimbursement(emp.id, 10_000, 100); // full → 10000
    await approvedReimbursement(emp.id, 20_000, 50); // half → 10000

    await syncPayroll(env.DB, PERIOD);

    expect((await payrollRow(emp.id)).reimbursements).toBe(20_000);
  });

  it("approved requests alone still flow through when no breakup exists", async () => {
    const emp = await seedPayrollEmployee(2_400_000);
    await approvedReimbursement(emp.id, 12_345);

    await syncPayroll(env.DB, PERIOD);

    expect((await payrollRow(emp.id)).reimbursements).toBe(12_345);
  });

  it("PUT computes reimbursed_total per line and payroll reflects it", async () => {
    const hr = await seedEmployee(env.DB, { role: "admin", tier: "hr" });
    const emp = await seedPayrollEmployee(2_400_000);
    const headers = {
      ...(await employeeAuthHeaders(env.DB, hr)),
      "content-type": "application/json",
    };

    const res = await call("/api/admin/reimbursement-breakup", {
      method: "PUT",
      headers,
      body: JSON.stringify({
        employee_id: emp.id,
        period: PERIOD,
        entries: [
          { label: "A", amount: 10_000, percent: 100 },
          { label: "B", amount: 10_000, percent: 50 },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { total: number; reimbursed_total: number };
    expect(body.total).toBe(20_000);
    expect(body.reimbursed_total).toBe(10_000 + 5_000); // 100% of A + 50% of B

    expect((await payrollRow(emp.id)).reimbursements).toBe(15_000);
  });
});
