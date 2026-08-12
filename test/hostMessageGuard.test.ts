import { describe, expect, it } from "vitest";
import { isTrustedOrigin, isValidSessionPayload } from "../src/web/lib/hostMessageGuard";

const REAL_ORIGIN = "https://app.munshot.com";
const ALLOWED = [REAL_ORIGIN];

describe("h) malicious/untrusted postMessage origin", () => {
  it("accepts a message from an allow-listed origin", () => {
    expect(isTrustedOrigin(REAL_ORIGIN, ALLOWED)).toBe(true);
  });

  it("rejects a look-alike origin", () => {
    expect(isTrustedOrigin("https://app.munshot.com.evil.example", ALLOWED)).toBe(false);
    expect(isTrustedOrigin("https://evil.example", ALLOWED)).toBe(false);
    expect(isTrustedOrigin("http://app.munshot.com", ALLOWED)).toBe(false); // scheme must match too
  });

  it("rejects everything when the allow-list is unconfigured (fails closed, not open)", () => {
    expect(isTrustedOrigin(REAL_ORIGIN, [])).toBe(false);
    expect(isTrustedOrigin("https://evil.example", [])).toBe(false);
  });

  it("rejects an empty or malformed origin string", () => {
    expect(isTrustedOrigin("", ALLOWED)).toBe(false);
    expect(isTrustedOrigin("null", ALLOWED)).toBe(false);
  });

  it("is not fooled by a wildcard-shaped allow-list entry unless it's exact", () => {
    expect(isTrustedOrigin("https://sub.app.munshot.com", ALLOWED)).toBe(false);
  });
});

describe("host session payload shape validation", () => {
  it("accepts a well-formed session payload", () => {
    expect(
      isValidSessionPayload({
        token: "jwt-looking-string",
        userName: "Dana",
        email: "dana@example.com",
        orgId: "org_1",
        orgName: "Acme",
      }),
    ).toBe(true);
  });

  it("accepts null optional fields", () => {
    expect(isValidSessionPayload({ token: null, userName: null, email: null, orgId: null, orgName: null })).toBe(
      true,
    );
  });

  it("rejects a non-object payload", () => {
    expect(isValidSessionPayload("not-an-object")).toBe(false);
    expect(isValidSessionPayload(null)).toBe(false);
    expect(isValidSessionPayload(undefined)).toBe(false);
    expect(isValidSessionPayload(42)).toBe(false);
  });

  it("rejects an email with no @", () => {
    expect(isValidSessionPayload({ email: "not-an-email" })).toBe(false);
  });

  it("rejects a non-string email", () => {
    expect(isValidSessionPayload({ email: 12345 })).toBe(false);
    expect(isValidSessionPayload({ email: { toString: () => "a@b.com" } })).toBe(false);
  });

  it("rejects an implausibly long email", () => {
    expect(isValidSessionPayload({ email: `${"a".repeat(400)}@example.com` })).toBe(false);
  });

  it("rejects wrong-typed optional fields even with a valid email", () => {
    expect(isValidSessionPayload({ email: "dana@example.com", token: 12345 })).toBe(false);
    expect(isValidSessionPayload({ email: "dana@example.com", orgId: {} })).toBe(false);
  });
});
