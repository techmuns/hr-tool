/**
 * Payslip rendering for the monthly payroll email.
 *
 * The Muns raw email API takes a plain-text body only (no HTML), so the payslip
 * is laid out as fixed-width text: two short tables, earnings then deductions,
 * ending in net pay. Deliberately minimal — the columns here are the ones the
 * app actually stores, nothing invented for decoration.
 */

/** Shown as the payslip header. The only place the company name is spelled out. */
export const COMPANY_NAME = "Muns";

/** Width of the label column in the earnings/deductions tables. */
const LABEL_WIDTH = 34;
const AMOUNT_WIDTH = 14;

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

/** Formats an integer paise amount as an INR string, e.g. "₹51,234.50". */
function money(paise: number): string {
  return inr.format(paise / 100);
}

/** "2026-08-11" -> "11 Aug 2026". */
function dateLabel(iso: string): string {
  const d = new Date(iso.length > 10 ? iso.replace(" ", "T") + "Z" : `${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export interface PayCycle {
  /** First day covered, inclusive — the 11th of the month before the period. */
  start: string;
  /** Last day covered, inclusive — the 10th of the period's own month. */
  end: string;
  /** The day the money goes out: the 11th, right after the cycle closes. */
  payDate: string;
}

/**
 * The pay cycle a "YYYY-MM" period stands for. Billing runs 11th-to-10th and in
 * arrears, so a period is named for the month it is PAID in, not the month it
 * covers: period 2026-08 covers 11 Jul – 10 Aug 2026 and is paid on 11 Aug.
 * Everything that has to line up with a cycle — the unpaid-leave window, the
 * reimbursement window, the payslip header — derives from this one function.
 */
export function payCycle(period: string): PayCycle {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return { start: "", end: "", payDate: "" };
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  // `month` is 1-based and the Date argument is 0-based, so `month - 1` is the
  // period's own month and `month - 2` the one before it. Date normalises the
  // negative index for January, rolling back into the previous year.
  return {
    start: iso(new Date(Date.UTC(year, month - 2, 11))),
    end: iso(new Date(Date.UTC(year, month - 1, 10))),
    payDate: iso(new Date(Date.UTC(year, month - 1, 11))),
  };
}

/** The date a period's salaries are due — the 11th that closes the cycle. */
export function payDueDate(period: string): string {
  return payCycle(period).payDate;
}

/** "2026-08" -> "11 Jul – 10 Aug 2026", the span the payslip actually covers. */
export function cycleLabel(period: string): string {
  const { start, end } = payCycle(period);
  if (!start || !end) return period;
  const day = (iso: string, withYear: boolean) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
      timeZone: "UTC",
      day: "numeric",
      month: "short",
      ...(withYear ? { year: "numeric" as const } : {}),
    });
  // A cycle spanning new year (11 Dec – 10 Jan) needs both years to be readable.
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${day(start, !sameYear)} – ${day(end, true)}`;
}

export interface PayslipRow {
  employee_name: string;
  job_title: string;
  period: string;
  paid_days: number;
  unpaid_days: number;
  base_salary: number;
  reimbursements: number;
  deductions: number;
  net_pay: number;
  paid_at: string | null;
}

export function payslipSubject(period: string): string {
  return `Monthly Payslip — ${cycleLabel(period)}`;
}

function row(label: string, amount: number): string {
  return label.padEnd(LABEL_WIDTH) + money(amount).padStart(AMOUNT_WIDTH);
}

function rule(): string {
  return "-".repeat(LABEL_WIDTH + AMOUNT_WIDTH);
}

function field(label: string, value: string): string {
  return `${label.padEnd(16)}: ${value}`;
}

export function payslipText(r: PayslipRow): string {
  const totalEarnings = r.base_salary + r.reimbursements;
  const lines: string[] = [
    `${COMPANY_NAME} — MONTHLY PAYSLIP`,
    "",
    field("Pay Period", cycleLabel(r.period)),
    field("Employee Name", r.employee_name),
    field("Designation", r.job_title || "—"),
    field("Worked Days", String(r.paid_days)),
    "",
    "EARNINGS".padEnd(LABEL_WIDTH) + "AMOUNT".padStart(AMOUNT_WIDTH),
    rule(),
    row("Basic Pay", r.base_salary),
  ];

  // Only list reimbursements when there are any — an empty ₹0.00 line is noise.
  if (r.reimbursements > 0) lines.push(row("Reimbursements", r.reimbursements));

  lines.push(rule(), row("Total Earnings", totalEarnings), "");

  lines.push("DEDUCTIONS".padEnd(LABEL_WIDTH) + "AMOUNT".padStart(AMOUNT_WIDTH), rule());
  if (r.deductions > 0) {
    lines.push(row(`Unpaid Leave (${r.unpaid_days} day${r.unpaid_days === 1 ? "" : "s"})`, r.deductions));
  } else {
    lines.push("No deductions this period.");
  }
  lines.push(rule(), row("Total Deductions", r.deductions), "");

  lines.push(rule(), row("NET PAY", r.net_pay), rule(), "");

  lines.push(r.paid_at ? `Paid on ${dateLabel(r.paid_at)}.` : `Due on ${dateLabel(payDueDate(r.period))}.`);
  lines.push("This is a system generated payslip.");

  return lines.join("\n");
}

/* -------------------------------------------------------------------------- */
/* HTML payslip                                                               */
/*                                                                            */
/* Email clients are not browsers: no flexbox, no grid, and <style> blocks are */
/* stripped by several of them. So this is table-based layout with every rule  */
/* inlined, a 600px container, and web-safe fonts only — the standard shape    */
/* that survives Gmail, Outlook and Apple Mail alike.                          */
/* -------------------------------------------------------------------------- */

const BRAND = "#2a78d6";
const INK = "#0b0b0b";
const MUTED = "#6b6b6b";
const HAIRLINE = "#e4e6ea";
const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Employee-supplied text lands in markup, so escape it rather than trust it. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** One "label : value" line in the header block. */
function metaRow(label: string, value: string): string {
  return `<tr>
      <td style="padding:3px 0;font:400 13px ${FONT};color:${MUTED};white-space:nowrap;">${esc(label)}</td>
      <td style="padding:3px 0 3px 16px;font:600 13px ${FONT};color:${INK};">${esc(value)}</td>
    </tr>`;
}

/** A money line inside the earnings or deductions table. */
function amountRow(label: string, amount: number, opts: { strong?: boolean } = {}): string {
  const weight = opts.strong ? 700 : 400;
  const border = opts.strong ? `border-top:1px solid ${HAIRLINE};` : "";
  return `<tr>
      <td style="${border}padding:9px 0;font:${weight} 13px ${FONT};color:${INK};">${esc(label)}</td>
      <td align="right" style="${border}padding:9px 0;font:${weight} 13px ${FONT};color:${INK};white-space:nowrap;">${money(amount)}</td>
    </tr>`;
}

function sectionHeading(text: string): string {
  return `<tr><td colspan="2" style="padding:0 0 6px;border-bottom:2px solid ${HAIRLINE};
    font:700 11px ${FONT};letter-spacing:.09em;text-transform:uppercase;color:${MUTED};">${esc(text)}</td></tr>`;
}

export function payslipHtml(r: PayslipRow): string {
  const totalEarnings = r.base_salary + r.reimbursements;
  const settled = r.paid_at
    ? `Paid on ${dateLabel(r.paid_at)}`
    : `Due on ${dateLabel(payDueDate(r.period))}`;

  const earnings = [
    amountRow("Basic Pay", r.base_salary),
    // Skip a ₹0.00 line rather than print an empty row.
    r.reimbursements > 0 ? amountRow("Reimbursements", r.reimbursements) : "",
    amountRow("Total Earnings", totalEarnings, { strong: true }),
  ].join("");

  const deductions = [
    r.deductions > 0
      ? amountRow(`Unpaid Leave (${r.unpaid_days} day${r.unpaid_days === 1 ? "" : "s"})`, r.deductions)
      : `<tr><td colspan="2" style="padding:9px 0;font:400 13px ${FONT};color:${MUTED};">No deductions this period.</td></tr>`,
    amountRow("Total Deductions", r.deductions, { strong: true }),
  ].join("");

  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;">
  <tr><td align="center" style="padding:28px 12px;">

    <!-- width="100%" + max-width, not width="600": the HTML attribute wins over
         CSS, so a fixed 600 would force phones to scroll sideways. -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${HAIRLINE};border-radius:10px;overflow:hidden;">

      <tr><td style="background:${BRAND};padding:26px 30px;">
        <div style="font:600 11px ${FONT};letter-spacing:.14em;text-transform:uppercase;color:#ffffff;opacity:.8;">${esc(COMPANY_NAME)}</div>
        <div style="font:700 23px ${FONT};color:#ffffff;padding-top:4px;">Monthly Payslip</div>
        <div style="font:400 13px ${FONT};color:#ffffff;opacity:.9;padding-top:3px;">${esc(cycleLabel(r.period))}</div>
      </td></tr>

      <tr><td style="padding:24px 30px 6px;">
        <table role="presentation" cellpadding="0" cellspacing="0">
          ${metaRow("Employee", r.employee_name)}
          ${metaRow("Designation", r.job_title || "—")}
          ${metaRow("Pay Period", cycleLabel(r.period))}
          ${metaRow("Worked Days", String(r.paid_days))}
        </table>
      </td></tr>

      <tr><td style="padding:18px 30px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${sectionHeading("Earnings")}
          ${earnings}
        </table>
      </td></tr>

      <tr><td style="padding:22px 30px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${sectionHeading("Deductions")}
          ${deductions}
        </table>
      </td></tr>

      <tr><td style="padding:24px 30px 4px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="background:#eef4fc;border-radius:8px;">
          <tr>
            <td style="padding:14px 16px;font:700 13px ${FONT};letter-spacing:.05em;text-transform:uppercase;color:${BRAND};">Net Pay</td>
            <td align="right" style="padding:14px 16px;font:700 20px ${FONT};color:${BRAND};white-space:nowrap;">${money(r.net_pay)}</td>
          </tr>
        </table>
      </td></tr>

      <tr><td style="padding:16px 30px 26px;">
        <div style="font:400 12px ${FONT};color:${MUTED};">${esc(settled)}.</div>
        <div style="font:400 12px ${FONT};color:${MUTED};padding-top:2px;">This is a system generated payslip.</div>
      </td></tr>

    </table>

  </td></tr>
</table>
</body>
</html>`;
}
