import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/worker/index";
import { createEmployeeSession } from "../src/worker/employeeSession";
import { seedEmployee } from "./helpers";
import type { Employee } from "../src/worker/types";

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`https://hr.test${path}`, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

const bearer = (token: string): HeadersInit => ({ Authorization: `Bearer ${token}` });

describe("base identity is the token, not a client-declared header", () => {
  it("rejects the old attack: a spoofed x-user-id header with no token is 401", async () => {
    const victim = await seedEmployee(env.DB);

    // Exactly what used to work: claim to be someone by setting the header.
    const res = await call("/api/me", { headers: { "x-user-id": String(victim.id), "x-role": "admin" } });
    expect(res.status).toBe(401);
  });

  it("serves the token's own employee; a spoofed x-user-id header is ignored", async () => {
    const alice = await seedEmployee(env.DB);
    const bob = await seedEmployee(env.DB);
    const aliceToken = await createEmployeeSession(env.DB, alice.id);

    // Alice's real token, but she also tries to declare she's Bob.
    const res = await call("/api/me", {
      headers: { ...bearer(aliceToken), "x-user-id": String(bob.id), "x-role": "admin" },
    });
    expect(res.status).toBe(200);
    const me = (await res.json()) as Employee;
    // The header is dead weight now: identity is whoever the token was issued for.
    expect(me.id).toBe(alice.id);
    expect(me.id).not.toBe(bob.id);
  });

  it("a garbage bearer token is 401, not a silent impersonation", async () => {
    const res = await call("/api/me", { headers: bearer("totally-made-up") });
    expect(res.status).toBe(401);
  });

  it("a plain employee's token cannot reach an admin-only route", async () => {
    const emp = await seedEmployee(env.DB, { role: "employee", tier: "employee" });
    const token = await createEmployeeSession(env.DB, emp.id);

    // /employees is requireAdmin. Role comes from the DB row behind the token,
    // so a non-admin can't get in by asserting x-role: admin.
    const res = await call("/api/employees", { headers: { ...bearer(token), "x-role": "admin" } });
    expect(res.status).toBe(403);
  });

  it("an admin's token does reach the admin route (role read from the DB row)", async () => {
    const admin = await seedEmployee(env.DB, { role: "admin", tier: "founder" });
    const token = await createEmployeeSession(env.DB, admin.id);

    const res = await call("/api/employees", { headers: bearer(token) });
    expect(res.status).toBe(200);
  });
});

describe("login issues a usable session token", () => {
  it("verify-otp returns a token that then authorizes /me as that employee", async () => {
    const emp = await seedEmployee(env.DB, { email: `otp-${crypto.randomUUID()}@example.com` });

    // Seed a valid, unexpired OTP the way request-otp would.
    const code = "123456";
    await env.DB.prepare(
      "INSERT INTO email_otps (email, code, expires_at) VALUES (?, ?, ?)"
    )
      .bind(emp.email.toLowerCase(), code, new Date(Date.now() + 60_000).toISOString())
      .run();

    const login = await call("/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emp.email, code }),
    });
    expect(login.status).toBe(200);
    const body = (await login.json()) as { token: string; employee: Employee };
    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBeGreaterThan(20);

    const me = await call("/api/me", { headers: bearer(body.token) });
    expect(me.status).toBe(200);
    expect(((await me.json()) as Employee).id).toBe(emp.id);
  });

  it("logout revokes the token", async () => {
    const emp = await seedEmployee(env.DB);
    const token = await createEmployeeSession(env.DB, emp.id);

    expect((await call("/api/me", { headers: bearer(token) })).status).toBe(200);

    const out = await call("/api/auth/logout", { method: "POST", headers: bearer(token) });
    expect(out.status).toBe(200);

    expect((await call("/api/me", { headers: bearer(token) })).status).toBe(401);
  });
});
