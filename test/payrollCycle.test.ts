import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/worker/index";
import { createEmployeeSession } from "../src/worker/employeeSession";
import { seedEmployee } from "./helpers";
import { periodForDate, shiftPeriod } from "../src/worker/payslip";
import { recentPeriods } from "../src/web/date";

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`https://hr.test${path}`, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

interface ActiveCycle {
  period: string;
  calendarPeriod: string;
  held: boolean;
  unpaid: number;
  total: number;
}

/** An admin (founder) and the bearer headers that authenticate them. */
async function founder(): Promise<HeadersInit> {
  const employee = await seedEmployee(env.DB, { role: "admin", tier: "founder" });
  return { Authorization: `Bearer ${await createEmployeeSession(env.DB, employee.id)}` };
}

/** A payroll row for a cycle, optionally already settled. */
async function seedPayrollRow(
  period: string,
  opts: { paid?: boolean; archived?: boolean } = {},
): Promise<number> {
  const employee = await seedEmployee(env.DB);
  if (opts.archived) {
    await env.DB.prepare("UPDATE employees SET archived = 1 WHERE id = ?").bind(employee.id).run();
  }
  await env.DB.prepare(
    `INSERT INTO payroll (employee_id, period, base_salary, net_pay, paid_at)
     VALUES (?, ?, 100000, 100000, ?)`,
  )
    .bind(employee.id, period, opts.paid ? "2026-01-01 00:00:00" : null)
    .run();
  return employee.id;
}

async function activeCycle(headers: HeadersInit): Promise<ActiveCycle> {
  const res = await call("/api/admin/payroll/active-period", { headers });
  expect(res.status).toBe(200);
  return (await res.json()) as ActiveCycle;
}

/** The cycle that most recently came due: the one paid on the last 11th. */
function dueCycle(): { calendarPeriod: string; due: string } {
  const calendarPeriod = periodForDate(new Date().toISOString().slice(0, 10));
  return { calendarPeriod, due: shiftPeriod(calendarPeriod, -1) };
}

// The endpoint answers about the whole payroll table, so rows left behind by
// one test would decide the next one's answer.
beforeEach(async () => {
  await env.DB.prepare("DELETE FROM payroll").run();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the pay cycle only rolls over once everyone is marked paid", () => {
  it("holds a due cycle open while anyone in it is unpaid", async () => {
    const headers = await founder();
    const { calendarPeriod, due } = dueCycle();

    await seedPayrollRow(due, { paid: true });
    await seedPayrollRow(due, { paid: false });

    const cycle = await activeCycle(headers);
    // The calendar has moved on; payroll has not.
    expect(cycle.period).toBe(due);
    expect(cycle.calendarPeriod).toBe(calendarPeriod);
    expect(cycle.held).toBe(true);
    expect(cycle.unpaid).toBe(1);
    expect(cycle.total).toBe(2);
  });

  it("rolls over as soon as the last person is marked paid", async () => {
    const headers = await founder();
    const { calendarPeriod, due } = dueCycle();

    await seedPayrollRow(due, { paid: false });
    expect((await activeCycle(headers)).period).toBe(due);

    // Settling the cycle is exactly what the founder's "Mark dues paid" does.
    const res = await call("/api/admin/payroll/paid", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ period: due, paid: true }),
    });
    expect(res.status).toBe(200);

    const cycle = await activeCycle(headers);
    expect(cycle.period).toBe(calendarPeriod);
    expect(cycle.held).toBe(false);
  });

  it("keeps holding when only some of the cycle is marked paid", async () => {
    const headers = await founder();
    const { due } = dueCycle();

    const first = await seedPayrollRow(due, { paid: false });
    await seedPayrollRow(due, { paid: false });

    const res = await call("/api/admin/payroll/paid", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ period: due, paid: true, employee_id: first }),
    });
    expect(res.status).toBe(200);

    const cycle = await activeCycle(headers);
    expect(cycle.period).toBe(due);
    expect(cycle.held).toBe(true);
    expect(cycle.unpaid).toBeGreaterThan(0);
  });

  it("never pins itself on the cycle still accruing, which is unpaid by definition", async () => {
    const headers = await founder();
    const { calendarPeriod } = dueCycle();

    // An unpaid row in the CURRENT cycle — it isn't due yet, so it must not
    // hold anything open (that would freeze the app on one period forever).
    await seedPayrollRow(calendarPeriod, { paid: false });

    const cycle = await activeCycle(headers);
    expect(cycle.period).toBe(calendarPeriod);
    expect(cycle.held).toBe(false);
  });

  it("ignores archived people, whose rows can never be marked paid from the UI", async () => {
    const headers = await founder();
    const { calendarPeriod, due } = dueCycle();

    await seedPayrollRow(due, { paid: true });
    await seedPayrollRow(due, { paid: false, archived: true });

    const cycle = await activeCycle(headers);
    expect(cycle.period).toBe(calendarPeriod);
    expect(cycle.held).toBe(false);
  });

  it("surfaces the oldest unpaid cycle when two are outstanding", async () => {
    const headers = await founder();
    const { calendarPeriod, due } = dueCycle();
    const older = shiftPeriod(calendarPeriod, -2);

    await seedPayrollRow(due, { paid: false });
    await seedPayrollRow(older, { paid: false });

    // The older debt is the one that should be staring at you.
    expect((await activeCycle(headers)).period).toBe(older);
  });

  it("is admin-only", async () => {
    const employee = await seedEmployee(env.DB);
    const token = await createEmployeeSession(env.DB, employee.id);
    const res = await call("/api/admin/payroll/active-period", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });
});

describe("the cycle picker can always reach the cycle it is showing", () => {
  it("offers the cycle now accruing once the 11th has passed", () => {
    // The regression: on the 11th the default period rolls to next month's,
    // but the old calendar-month list stopped at the current month — so the
    // picker's own value wasn't among its options and it rendered blank.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-11T09:00:00Z"));

    const selected = periodForDate("2026-09-11");
    expect(selected).toBe("2026-10");

    const values = recentPeriods(12, selected).map((p) => p.value);
    expect(values).toContain("2026-10"); // the cycle now accruing
    expect(values).toContain("2026-09"); // 11 Aug – 10 Sep, the one just closed
    expect(values).toContain("2026-08"); // 11 Jul – 10 Aug
  });

  it("includes a held cycle even when it is older than the default window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-11T09:00:00Z"));

    const values = recentPeriods(1, "2026-08").map((p) => p.value);
    expect(values).toEqual(["2026-10", "2026-08"]);
  });

  it("labels options by the span they bill, not the month they are named for", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-11T09:00:00Z"));

    const september = recentPeriods(12).find((p) => p.value === "2026-09");
    // Not "September 2026": the period is NAMED for the month it pays out in,
    // and showing that alone is what made HR pick the wrong cycle.
    expect(september?.label).toMatch(/^11 Aug – 10 Sept? 2026$/);
  });

  it("never offers cycles from before the company used the tool", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-11T09:00:00Z"));

    const values = recentPeriods(24).map((p) => p.value);
    expect(values).toContain("2026-08");
    expect(values).not.toContain("2026-07"); // 11 Jun – 10 Jul, pre-launch
  });
});

describe("shiftPeriod", () => {
  it("steps whole months and normalises the year boundary", () => {
    expect(shiftPeriod("2026-09", 1)).toBe("2026-10");
    expect(shiftPeriod("2026-01", -1)).toBe("2025-12");
    expect(shiftPeriod("2026-12", 1)).toBe("2027-01");
    expect(shiftPeriod("2026-09", 0)).toBe("2026-09");
  });
});
