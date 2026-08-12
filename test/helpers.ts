import type { Employee, EmployeeRole, Tier } from "../src/worker/types";

export async function seedEmployee(
  db: D1Database,
  overrides: Partial<Pick<Employee, "name" | "email" | "role" | "tier">> = {},
): Promise<Employee> {
  const name = overrides.name ?? `Test Employee ${crypto.randomUUID()}`;
  const email = overrides.email ?? `${crypto.randomUUID()}@example.com`;
  const role: EmployeeRole = overrides.role ?? "employee";
  const tier: Tier = overrides.tier ?? "employee";

  const result = await db
    .prepare(
      "INSERT INTO employees (name, email, date_of_joining, role, tier) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(name, email, "2024-01-01", role, tier)
    .run();

  const employee = await db
    .prepare("SELECT * FROM employees WHERE id = ?")
    .bind(result.meta.last_row_id)
    .first<Employee>();
  if (!employee) throw new Error("seedEmployee: insert did not return a row");
  return employee;
}

/** Headers a legitimate client sends for the regular (base) employee session. */
export function employeeHeaders(employee: Pick<Employee, "id" | "role">): HeadersInit {
  return { "x-user-id": String(employee.id), "x-role": employee.role };
}

/** Pulls the value of one cookie out of a Response's Set-Cookie header(s). */
export function getSetCookie(res: Response, name: string): string | null {
  const raw =
    typeof (res.headers as { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : [res.headers.get("set-cookie") ?? ""];

  for (const cookieHeader of raw) {
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    if (match) return match[1];
  }
  return null;
}

export function cookieHeader(name: string, value: string): HeadersInit {
  return { cookie: `${name}=${value}` };
}
