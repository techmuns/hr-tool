import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { cookieHeader, employeeHeaders, getSetCookie, seedEmployee } from "./helpers";
import type { Employee } from "../src/worker/types";

const BASE = "https://example.com/api";

async function setAdminPassword(admin: Employee, password: string): Promise<Response> {
  return SELF.fetch(`${BASE}/auth/admin-password/set`, {
    method: "POST",
    headers: { ...employeeHeaders(admin), "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
}

async function adminLogin(admin: Employee, password: string): Promise<Response> {
  return SELF.fetch(`${BASE}/auth/admin-login`, {
    method: "POST",
    headers: { ...employeeHeaders(admin), "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
}

/** Logs a privileged employee all the way in and returns their admin_session cookie value. */
async function unlockedAdmin(overrides: Partial<Pick<Employee, "tier">> = {}): Promise<{
  admin: Employee;
  cookie: string;
}> {
  const admin = await seedEmployee(env.DB, { role: "admin", tier: overrides.tier ?? "hr" });
  const password = "a-strong-admin-password-1";
  const setRes = await setAdminPassword(admin, password);
  expect(setRes.status).toBe(200);
  const loginRes = await adminLogin(admin, password);
  expect(loginRes.status).toBe(200);
  const cookie = getSetCookie(loginRes, "admin_session");
  if (!cookie) throw new Error("admin login did not set a session cookie");
  return { admin, cookie };
}

describe("a) normal employee login", () => {
  it("still works exactly as before, via header-based session", async () => {
    const employee = await seedEmployee(env.DB, { role: "employee", tier: "employee" });
    const res = await SELF.fetch(`${BASE}/me`, { headers: employeeHeaders(employee) });
    expect(res.status).toBe(200);
    const body = await res.json<Employee>();
    expect(body.id).toBe(employee.id);
  });

  it("never has to touch the admin-session cookie", async () => {
    const employee = await seedEmployee(env.DB, { role: "employee" });
    const res = await SELF.fetch(`${BASE}/attendance/me`, { headers: employeeHeaders(employee) });
    expect(res.status).toBe(200);
    expect(getSetCookie(res, "admin_session")).toBeNull();
  });
});

describe("b) privileged user without a password set", () => {
  it("admin-login reports no_password instead of granting a session", async () => {
    const admin = await seedEmployee(env.DB, { role: "admin", tier: "hr" });
    const res = await adminLogin(admin, "some-password-123456");
    expect(res.status).toBe(404);
    const body = await res.json<{ code?: string }>();
    expect(body.code).toBe("no_password");
    expect(getSetCookie(res, "admin_session")).toBeNull();
  });

  it("cannot reach admin APIs off the base session alone", async () => {
    const admin = await seedEmployee(env.DB, { role: "admin", tier: "hr" });
    const res = await SELF.fetch(`${BASE}/employees`, { headers: employeeHeaders(admin) });
    expect(res.status).toBe(401);
  });
});

describe("c) privileged user with the wrong password", () => {
  it("is rejected and gets no session cookie", async () => {
    const admin = await seedEmployee(env.DB, { role: "admin", tier: "hr" });
    expect((await setAdminPassword(admin, "the-real-password-123")).status).toBe(200);

    const res = await adminLogin(admin, "totally-wrong-password");
    expect(res.status).toBe(401);
    expect(getSetCookie(res, "admin_session")).toBeNull();

    const employeesRes = await SELF.fetch(`${BASE}/employees`, { headers: employeeHeaders(admin) });
    expect(employeesRes.status).toBe(401);
  });
});

describe("d) privileged user with the correct password", () => {
  it("unlocks a session cookie that grants access to admin APIs", async () => {
    const { admin, cookie } = await unlockedAdmin();
    const res = await SELF.fetch(`${BASE}/employees`, {
      headers: { ...employeeHeaders(admin), ...cookieHeader("admin_session", cookie) },
    });
    expect(res.status).toBe(200);
  });

  it("whoami reports the authenticated identity", async () => {
    const { admin, cookie } = await unlockedAdmin();
    const res = await SELF.fetch(`${BASE}/auth/admin-session`, {
      headers: { ...employeeHeaders(admin), ...cookieHeader("admin_session", cookie) },
    });
    const body = await res.json<{ authenticated: boolean; employee?: { id: number } }>();
    expect(body.authenticated).toBe(true);
    expect(body.employee?.id).toBe(admin.id);
  });

  it("logout revokes the cookie server-side", async () => {
    const { admin, cookie } = await unlockedAdmin();
    const logoutRes = await SELF.fetch(`${BASE}/auth/admin-logout`, {
      method: "POST",
      headers: { ...employeeHeaders(admin), ...cookieHeader("admin_session", cookie) },
    });
    expect(logoutRes.status).toBe(200);

    const res = await SELF.fetch(`${BASE}/employees`, {
      headers: { ...employeeHeaders(admin), ...cookieHeader("admin_session", cookie) },
    });
    expect(res.status).toBe(401);
  });
});

describe("e) expired admin session", () => {
  it("is rejected once past its expiry", async () => {
    const { admin, cookie } = await unlockedAdmin();

    await env.DB.prepare("UPDATE admin_sessions SET expires_at = ? WHERE employee_id = ?")
      .bind("2000-01-01T00:00:00.000Z", admin.id)
      .run();

    const res = await SELF.fetch(`${BASE}/employees`, {
      headers: { ...employeeHeaders(admin), ...cookieHeader("admin_session", cookie) },
    });
    expect(res.status).toBe(401);
  });
});

describe("f) forged/invalid admin session", () => {
  it("rejects a made-up cookie value", async () => {
    const admin = await seedEmployee(env.DB, { role: "admin", tier: "hr" });
    const res = await SELF.fetch(`${BASE}/employees`, {
      headers: { ...employeeHeaders(admin), ...cookieHeader("admin_session", "not-a-real-token") },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a well-formed but unknown token", async () => {
    const admin = await seedEmployee(env.DB, { role: "admin", tier: "hr" });
    const fakeToken = btoa("x".repeat(43)).replace(/=+$/, "");
    const res = await SELF.fetch(`${BASE}/employees`, {
      headers: { ...employeeHeaders(admin), ...cookieHeader("admin_session", fakeToken) },
    });
    expect(res.status).toBe(401);
  });
});

describe("g) unauthorized access to privileged APIs", () => {
  it("a spoofed x-role: admin header grants nothing by itself", async () => {
    const employee = await seedEmployee(env.DB, { role: "employee" });
    const res = await SELF.fetch(`${BASE}/employees`, {
      headers: { "x-user-id": String(employee.id), "x-role": "admin" },
    });
    expect(res.status).toBe(401);
  });

  it("every privileged endpoint refuses a base session with no admin cookie", async () => {
    const admin = await seedEmployee(env.DB, { role: "admin", tier: "founder" });
    const endpoints: [string, string][] = [
      ["GET", "/employees"],
      ["GET", "/admin/payroll?period=2026-08"],
      ["GET", "/admin/roles"],
      ["GET", "/admin/attendance"],
      ["GET", "/admin/adjustments?period=2026-08"],
      ["GET", "/admin/certificates"],
      ["GET", "/admin/chat?employee_id=1"],
      ["GET", "/admin/feedback"],
    ];
    for (const [method, path] of endpoints) {
      const res = await SELF.fetch(`${BASE}${path}`, { method, headers: employeeHeaders(admin) });
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });

  it("an HR (non-founder) admin session cannot reach founder-only routes", async () => {
    const { admin, cookie } = await unlockedAdmin({ tier: "hr" });
    const res = await SELF.fetch(`${BASE}/admin/feedback`, {
      headers: { ...employeeHeaders(admin), ...cookieHeader("admin_session", cookie) },
    });
    expect(res.status).toBe(401);
  });

  it("a downgraded employee's leftover admin session stops working immediately", async () => {
    const { admin, cookie } = await unlockedAdmin();
    // HR revokes this person's admin access.
    await env.DB.prepare("UPDATE employees SET role = 'employee', tier = 'employee' WHERE id = ?")
      .bind(admin.id)
      .run();

    const res = await SELF.fetch(`${BASE}/employees`, {
      headers: { ...employeeHeaders(admin), ...cookieHeader("admin_session", cookie) },
    });
    expect(res.status).toBe(401);
  });
});

describe("i) spoofing another employee/user_id", () => {
  it("cannot read another employee's reimbursement bill via a forged admin header", async () => {
    const owner = await seedEmployee(env.DB, { role: "employee" });
    const attacker = await seedEmployee(env.DB, { role: "employee" });
    await env.DB.prepare(
      `INSERT INTO reimbursements (employee_id, amount, note, bill_key, bill_name, bill_type, bill_size, status)
       VALUES (?, 1000, 'test', 'bills/owner-bill', 'bill.pdf', 'application/pdf', 100, 'approved')`,
    )
      .bind(owner.id)
      .run();
    const row = await env.DB.prepare("SELECT id FROM reimbursements WHERE employee_id = ?")
      .bind(owner.id)
      .first<{ id: number }>();

    const res = await SELF.fetch(`${BASE}/reimbursements/${row!.id}/bill`, {
      headers: { "x-user-id": String(attacker.id), "x-role": "admin" },
    });
    expect(res.status).toBe(403);
  });

  it("a real admin session CAN read someone else's bill (positive control)", async () => {
    const owner = await seedEmployee(env.DB, { role: "employee" });
    const { admin, cookie } = await unlockedAdmin();
    await env.DB.prepare(
      `INSERT INTO reimbursements (employee_id, amount, note, bill_key, bill_name, bill_type, bill_size, status)
       VALUES (?, 1000, 'test', 'bills/owner-bill-2', 'bill.pdf', 'application/pdf', 100, 'approved')`,
    )
      .bind(owner.id)
      .run();
    const row = await env.DB.prepare("SELECT id FROM reimbursements WHERE employee_id = ?")
      .bind(owner.id)
      .first<{ id: number }>();

    // No BILLS binding in this test env, so the meaningful assertion is that
    // the authorization check passes (503 "temporarily unavailable" from the
    // missing binding, not 403 "Not allowed").
    const res = await SELF.fetch(`${BASE}/reimbursements/${row!.id}/bill`, {
      headers: { ...employeeHeaders(admin), ...cookieHeader("admin_session", cookie) },
    });
    expect(res.status).not.toBe(403);
  });

  it("admin-login always authenticates as the caller's own verified session, never a named target", async () => {
    const admin = await seedEmployee(env.DB, { role: "admin", tier: "hr" });
    const otherAdmin = await seedEmployee(env.DB, { role: "admin", tier: "hr" });
    expect((await setAdminPassword(otherAdmin, "other-admins-password-1")).status).toBe(200);

    // `admin` has their own base session and no email/employee_id field exists
    // to name a different target — trying otherAdmin's password must fail as
    // "admin has no password set", never as a check against otherAdmin's hash.
    const res = await adminLogin(admin, "other-admins-password-1");
    expect(res.status).toBe(404);
  });

  it("cannot post into another employee's chat thread as admin without a real admin session", async () => {
    const employee = await seedEmployee(env.DB, { role: "employee" });
    const victim = await seedEmployee(env.DB, { role: "employee" });
    const res = await SELF.fetch(`${BASE}/chat`, {
      method: "POST",
      headers: { ...employeeHeaders(employee), "x-role": "admin", "content-type": "application/json" },
      body: JSON.stringify({ body: "hi", employee_id: victim.id }),
    });
    expect(res.status).toBe(200);
    const posted = await res.json<{ employee_id: number; sender_role: string }>();
    // Falls back to posting into the caller's OWN thread as themselves —
    // never lets the forged header redirect it into someone else's thread.
    expect(posted.employee_id).toBe(employee.id);
    expect(posted.sender_role).toBe("employee");
  });
});

describe("password/session hygiene", () => {
  it("rejects a weak admin password", async () => {
    const admin = await seedEmployee(env.DB, { role: "admin", tier: "hr" });
    const res = await setAdminPassword(admin, "short1");
    expect(res.status).toBe(400);
  });

  it("never returns a password or hash in any response body", async () => {
    const { admin, cookie } = await unlockedAdmin();
    const responses = await Promise.all([
      SELF.fetch(`${BASE}/me`, { headers: employeeHeaders(admin) }),
      SELF.fetch(`${BASE}/employees`, {
        headers: { ...employeeHeaders(admin), ...cookieHeader("admin_session", cookie) },
      }),
      SELF.fetch(`${BASE}/auth/admin-session`, {
        headers: { ...employeeHeaders(admin), ...cookieHeader("admin_session", cookie) },
      }),
    ]);
    for (const res of responses) {
      const text = await res.text();
      expect(text.toLowerCase()).not.toContain("password");
      expect(text.toLowerCase()).not.toContain("hash");
    }
  });

  it("changing the admin password invalidates existing sessions", async () => {
    const { admin, cookie } = await unlockedAdmin();
    expect((await setAdminPassword(admin, "a-different-password-2")).status).toBe(200);

    const res = await SELF.fetch(`${BASE}/employees`, {
      headers: { ...employeeHeaders(admin), ...cookieHeader("admin_session", cookie) },
    });
    expect(res.status).toBe(401);
  });
});
