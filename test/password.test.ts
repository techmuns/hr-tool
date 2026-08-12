import { describe, expect, it } from "vitest";
import { hashPassword, passwordStrengthError, verifyPassword } from "../src/worker/password";

describe("password hashing", () => {
  it("never stores the password in the hash it returns", async () => {
    const hash = await hashPassword("a-secret-password-123");
    expect(hash).not.toContain("a-secret-password-123");
    expect(hash.startsWith("$2")).toBe(true); // bcrypt format marker
  });

  it("round-trips through verifyPassword", async () => {
    const hash = await hashPassword("a-secret-password-123");
    expect(await verifyPassword("a-secret-password-123", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("produces a different hash each time (random salt)", async () => {
    const a = await hashPassword("same-password-1234567");
    const b = await hashPassword("same-password-1234567");
    expect(a).not.toBe(b);
  });

  it("enforces a minimum length", () => {
    expect(passwordStrengthError("short")).toBeTruthy();
    expect(passwordStrengthError("a-long-enough-password")).toBeNull();
  });
});
