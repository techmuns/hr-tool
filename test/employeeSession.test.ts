import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  bearerToken,
  createEmployeeSession,
  getEmployeeSessionEmployee,
  revokeEmployeeSession,
} from "../src/worker/employeeSession";
import { seedEmployee } from "./helpers";

describe("employee session tokens", () => {
  it("round-trips: a fresh token resolves to the employee it was issued for", async () => {
    const alice = await seedEmployee(env.DB, { role: "employee", tier: "employee" });
    const token = await createEmployeeSession(env.DB, alice.id);

    const resolved = await getEmployeeSessionEmployee(env.DB, token);
    expect(resolved?.id).toBe(alice.id);
    // role/tier come from the DB row, not from anything the caller supplied.
    expect(resolved?.role).toBe("employee");
  });

  it("cannot be edited into another employee's identity", async () => {
    const alice = await seedEmployee(env.DB);
    const bob = await seedEmployee(env.DB);
    const token = await createEmployeeSession(env.DB, alice.id);

    // Flip one character — the classic "change the id and refresh" attack, but
    // against the token. It no longer matches any stored session at all, so it
    // resolves to nobody rather than to Bob (or anyone else).
    const tampered = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    expect(await getEmployeeSessionEmployee(env.DB, tampered)).toBeNull();

    // And there is simply no token value that maps to Bob without the server
    // having issued one for Bob.
    expect(bob.id).not.toBe(alice.id);
    expect((await getEmployeeSessionEmployee(env.DB, token))?.id).toBe(alice.id);
  });

  it("rejects a made-up token, an empty token, and undefined", async () => {
    expect(await getEmployeeSessionEmployee(env.DB, "not-a-real-token")).toBeNull();
    expect(await getEmployeeSessionEmployee(env.DB, "")).toBeNull();
    expect(await getEmployeeSessionEmployee(env.DB, undefined)).toBeNull();
  });

  it("stores only a hash of the token, never the token itself", async () => {
    const alice = await seedEmployee(env.DB);
    const token = await createEmployeeSession(env.DB, alice.id);

    const rows = await env.DB.prepare(
      "SELECT token_hash FROM employee_sessions WHERE employee_id = ?"
    )
      .bind(alice.id)
      .all<{ token_hash: string }>();

    // A read of the table (backup, D1 console) can't be replayed as a live
    // session: what's stored is the SHA-256, not the bearer token.
    for (const row of rows.results) {
      expect(row.token_hash).not.toBe(token);
      expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("does not resolve an expired session", async () => {
    const alice = await seedEmployee(env.DB);
    const token = await createEmployeeSession(env.DB, alice.id);

    // Force this session to be in the past.
    await env.DB.prepare("UPDATE employee_sessions SET expires_at = ? WHERE employee_id = ?")
      .bind(new Date(Date.now() - 1000).toISOString(), alice.id)
      .run();

    expect(await getEmployeeSessionEmployee(env.DB, token)).toBeNull();
  });

  it("stops resolving after the session is revoked (logout)", async () => {
    const alice = await seedEmployee(env.DB);
    const token = await createEmployeeSession(env.DB, alice.id);
    expect((await getEmployeeSessionEmployee(env.DB, token))?.id).toBe(alice.id);

    await revokeEmployeeSession(env.DB, token);
    expect(await getEmployeeSessionEmployee(env.DB, token)).toBeNull();
  });

  it("parses the bearer token out of an Authorization header", () => {
    expect(bearerToken("Bearer abc.def")).toBe("abc.def");
    expect(bearerToken("bearer abc")).toBe("abc"); // scheme is case-insensitive
    expect(bearerToken("  Bearer   spaced  ")).toBe("spaced");
    expect(bearerToken("Basic abc")).toBeUndefined();
    expect(bearerToken(undefined)).toBeUndefined();
  });
});
