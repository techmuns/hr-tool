import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { getSetCookie, seedEmployee } from "./helpers";
import type { Employee } from "../src/worker/types";

const BASE = "https://example.com/api";

async function loginByEmail(email: string): Promise<Response> {
  return SELF.fetch(`${BASE}/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: email }),
  });
}

function sessionCookieHeader(cookie: string): HeadersInit {
  return { cookie: `hr_session=${cookie}` };
}

describe("employee session replaces x-user-id/x-role header trust", () => {
  it("/login sets an hr_session cookie that authenticates /me as that employee", async () => {
    const employee = await seedEmployee(env.DB, { role: "employee" });
    const loginRes = await loginByEmail(employee.email);
    expect(loginRes.status).toBe(200);
    const cookie = getSetCookie(loginRes, "hr_session");
    expect(cookie).toBeTruthy();

    const meRes = await SELF.fetch(`${BASE}/me`, { headers: sessionCookieHeader(cookie!) });
    expect(meRes.status).toBe(200);
    const me = await meRes.json<Employee>();
    expect(me.id).toBe(employee.id);
  });

  it("a request with no session at all is rejected", async () => {
    const res = await SELF.fetch(`${BASE}/me`);
    expect(res.status).toBe(401);
  });

  it("a forged x-user-id/x-role header pair, with no valid session, is rejected outright", async () => {
    const admin = await seedEmployee(env.DB, { role: "admin", tier: "founder" });
    const res = await SELF.fetch(`${BASE}/me`, {
      headers: { "x-user-id": String(admin.id), "x-role": "admin" },
    });
    expect(res.status).toBe(401);
  });

  it("an employee cannot reach an admin route by forging x-role: admin alongside their real cookie", async () => {
    const employee = await seedEmployee(env.DB, { role: "employee" });
    const loginRes = await loginByEmail(employee.email);
    const cookie = getSetCookie(loginRes, "hr_session")!;

    const res = await SELF.fetch(`${BASE}/employees`, {
      headers: { ...sessionCookieHeader(cookie), "x-role": "admin" },
    });
    expect(res.status).toBe(403);
  });

  it("a real admin's session cookie does reach an admin route", async () => {
    const admin = await seedEmployee(env.DB, { role: "admin", tier: "founder" });
    const loginRes = await loginByEmail(admin.email);
    const cookie = getSetCookie(loginRes, "hr_session")!;

    const res = await SELF.fetch(`${BASE}/employees`, { headers: sessionCookieHeader(cookie) });
    expect(res.status).toBe(200);
  });

  it("tampering with the cookie value invalidates it rather than pointing at someone else", async () => {
    const employee = await seedEmployee(env.DB, { role: "employee" });
    const loginRes = await loginByEmail(employee.email);
    const cookie = getSetCookie(loginRes, "hr_session")!;
    const tampered = cookie.slice(0, -4) + "Z".repeat(4);

    const res = await SELF.fetch(`${BASE}/me`, { headers: sessionCookieHeader(tampered) });
    expect(res.status).toBe(401);
  });

  it("/auth/verify-otp returns a bearer token that authenticates the same as the cookie", async () => {
    const employee = await seedEmployee(env.DB, { role: "employee" });
    await SELF.fetch(`${BASE}/auth/request-otp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: employee.email }),
    });
    const otpRow = await env.DB.prepare("SELECT code FROM email_otps WHERE email = ?")
      .bind(employee.email.toLowerCase())
      .first<{ code: string }>();
    expect(otpRow).toBeTruthy();

    const verifyRes = await SELF.fetch(`${BASE}/auth/verify-otp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: employee.email, code: otpRow!.code }),
    });
    expect(verifyRes.status).toBe(200);
    const body = await verifyRes.json<{ token: string; employee: Employee }>();
    expect(body.token).toBeTruthy();

    const res = await SELF.fetch(`${BASE}/me`, { headers: { Authorization: `Bearer ${body.token}` } });
    expect(res.status).toBe(200);
    const me = await res.json<Employee>();
    expect(me.id).toBe(employee.id);
  });

  it("/auth/logout revokes the session so the same cookie stops working", async () => {
    const employee = await seedEmployee(env.DB, { role: "employee" });
    const loginRes = await loginByEmail(employee.email);
    const cookie = getSetCookie(loginRes, "hr_session")!;

    const before = await SELF.fetch(`${BASE}/me`, { headers: sessionCookieHeader(cookie) });
    expect(before.status).toBe(200);

    const logoutRes = await SELF.fetch(`${BASE}/auth/logout`, {
      method: "POST",
      headers: sessionCookieHeader(cookie),
    });
    expect(logoutRes.status).toBe(200);

    const after = await SELF.fetch(`${BASE}/me`, { headers: sessionCookieHeader(cookie) });
    expect(after.status).toBe(401);
  });

  it("a demoted admin's existing session immediately loses admin access (fresh DB read, not cached)", async () => {
    const admin = await seedEmployee(env.DB, { role: "admin", tier: "hr" });
    const loginRes = await loginByEmail(admin.email);
    const cookie = getSetCookie(loginRes, "hr_session")!;

    const before = await SELF.fetch(`${BASE}/employees`, { headers: sessionCookieHeader(cookie) });
    expect(before.status).toBe(200);

    await env.DB.prepare("UPDATE employees SET role = 'employee' WHERE id = ?").bind(admin.id).run();

    const after = await SELF.fetch(`${BASE}/employees`, { headers: sessionCookieHeader(cookie) });
    expect(after.status).toBe(403);
  });
});
