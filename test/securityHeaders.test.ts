import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const BASE = "https://example.com";

describe("frame-ancestors CSP", () => {
  it("is set on a normal API response", async () => {
    const res = await SELF.fetch(`${BASE}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "nobody@example.com" }),
    });
    expect(res.headers.get("Content-Security-Policy")).toBe("frame-ancestors https://chat.muns.io");
  });

  it("is set on an unmatched /api/* route, whether it 404s or an earlier requireEmployee gate 401s it", async () => {
    const res = await SELF.fetch(`${BASE}/api/does-not-exist`);
    expect([401, 404]).toContain(res.status);
    expect(res.headers.get("Content-Security-Policy")).toBe("frame-ancestors https://chat.muns.io");
  });

  it("is set on the static-asset (SPA) fallback response", async () => {
    const res = await SELF.fetch(`${BASE}/`);
    expect(res.headers.get("Content-Security-Policy")).toBe("frame-ancestors https://chat.muns.io");
  });
});
