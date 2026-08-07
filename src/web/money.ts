const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

/** Formats an integer minor-unit amount (paise) as an INR currency string. */
export function formatINR(paise: number): string {
  return inr.format(paise / 100);
}

const inrPlain = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Same amount as formatINR, but with an ASCII "Rs." prefix instead of the ₹
 * glyph. jsPDF's built-in fonts (Helvetica etc.) only support WinAnsi
 * (Windows-1252), which has no ₹ — it renders as a broken/substituted
 * character. Use this instead of formatINR anywhere text is drawn with
 * jsPDF; formatINR is fine everywhere else (the browser's own fonts render ₹
 * correctly).
 */
export function formatRupeesPlain(paise: number): string {
  return `Rs. ${inrPlain.format(paise / 100)}`;
}
