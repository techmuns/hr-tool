/**
 * Munshot's identity, shared by every branded HTML/PDF document this app
 * produces — payslips, certificates, and whatever comes after. One place for
 * the name and the navy-and-gold palette that matches the Munshot mark
 * (src/worker/munshotLogo.ts), so a second document type reuses these values
 * instead of hand-copying hex strings that could drift from the original.
 */

export const COMPANY_NAME = "Munshot";

// Matches the Munshot mark: a gold "M" on near-black navy. Two golds, not one —
// GOLD reads clearly on a dark background, but that same value is too light
// to pass as body text on white, so GOLD_DEEP stands in there.
export const BRAND_COLORS = {
  NAVY: "#11141f",
  GOLD: "#e8c26a",
  GOLD_SOFT_ON_DARK: "rgba(232, 194, 106, 0.16)",
  GOLD_DEEP: "#8a5f0a", // darker than GOLD — needs to clear 4.5:1 on white/GOLD_TINT for small bold text
  GOLD_TINT: "#faf1de",
  INK: "#0b0b0b",
  MUTED: "#52514e",
  BORDER: "#e5e5e2",
};
