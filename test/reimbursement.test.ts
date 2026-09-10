import { describe, expect, it } from "vitest";
import { reimbursedForEntry, reimbursedTotal } from "../src/worker/reimbursement";

describe("reimbursedForEntry", () => {
  it("pays the full amount at 100%", () => {
    expect(reimbursedForEntry(10000, true)).toBe(10000);
  });

  it("pays half at 50%", () => {
    expect(reimbursedForEntry(10000, false)).toBe(5000);
  });

  it("rounds the odd paise up when halving", () => {
    // 501 / 2 = 250.5 → 251, matching Math.round and the migration's (total+1)/2.
    expect(reimbursedForEntry(501, false)).toBe(251);
    expect(reimbursedForEntry(3, false)).toBe(2);
  });
});

describe("reimbursedTotal", () => {
  it("sums each line at its own per-line rate", () => {
    const entries = [
      { amount: 10000, full: true }, // 100% → 10000
      { amount: 4000, full: false }, // 50%  → 2000
      { amount: 999, full: false }, // 50%  → 500 (499.5 rounded up)
    ];
    expect(reimbursedTotal(entries)).toBe(12500);
  });

  it("is 0 for an empty breakup", () => {
    expect(reimbursedTotal([])).toBe(0);
  });
});
