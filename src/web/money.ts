const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

/** Formats an integer minor-unit amount (paise) as an INR currency string. */
export function formatINR(paise: number): string {
  return inr.format(paise / 100);
}
