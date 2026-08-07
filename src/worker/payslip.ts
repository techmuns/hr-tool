/**
 * Payslip rendering for the monthly payroll email.
 *
 * The Muns raw email API does not render HTML: real markup sent through it came
 * back as literal escaped tags, confirming it treats the body as text to
 * display, not a document to parse — it just escapes special characters and
 * converts \n to <br>. So this is plain text, laid out as two short tables
 * (earnings, deductions) ending in net pay.
 *
 * The consequence of that escape-and-wrap step: it drops the content into an
 * HTML container, so ordinary runs of ASCII spaces collapse to one under
 * normal HTML whitespace rules — which is exactly what broke the column
 * alignment the first time this shipped. The fix is to pad with U+00A0
 * (non-breaking space) instead of the regular space padEnd/padStart use by
 * default; nbsp isn't whitespace as far as that collapsing rule is concerned,
 * so the columns survive being displayed as HTML.
 */

/** Padding character immune to HTML whitespace collapsing. Ordinary spaces
 * inside words are unaffected — collapsing two of those into one is invisible
 * anyway — only the padding run itself needs this. */
const PAD = " ";

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
  /** Total deductions; `leave_deductions + other_deductions` add up to this. */
  deductions: number;
  leave_deductions: number;
  other_deductions: number;
  net_pay: number;
  paid_at: string | null;
}

export function payslipSubject(period: string): string {
  return `Monthly Payslip — ${cycleLabel(period)}`;
}

function row(label: string, amount: number): string {
  return label.padEnd(LABEL_WIDTH, PAD) + money(amount).padStart(AMOUNT_WIDTH, PAD);
}

function rule(): string {
  return "-".repeat(LABEL_WIDTH + AMOUNT_WIDTH);
}

function field(label: string, value: string): string {
  return `${label.padEnd(16, PAD)}: ${value}`;
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
    "EARNINGS".padEnd(LABEL_WIDTH, PAD) + "AMOUNT".padStart(AMOUNT_WIDTH, PAD),
    rule(),
    row("Basic Pay", r.base_salary),
  ];

  // Only list reimbursements when there are any — an empty ₹0.00 line is noise.
  if (r.reimbursements > 0) lines.push(row("Reimbursements", r.reimbursements));

  lines.push(rule(), row("Total Earnings", totalEarnings), "");

  lines.push("DEDUCTIONS".padEnd(LABEL_WIDTH, PAD) + "AMOUNT".padStart(AMOUNT_WIDTH, PAD), rule());
  // Leave and manually-booked deductions are listed apart: seeing one lump sum
  // labelled "unpaid leave" when half of it was an advance recovery is exactly
  // the sort of thing that turns into a payroll query.
  if (r.leave_deductions > 0) {
    lines.push(row(`Unpaid Leave (${r.unpaid_days} day${r.unpaid_days === 1 ? "" : "s"})`, r.leave_deductions));
  }
  if (r.other_deductions > 0) lines.push(row("Other Deductions", r.other_deductions));
  if (r.deductions <= 0) lines.push("No deductions this period.");
  lines.push(rule(), row("Total Deductions", r.deductions), "");

  lines.push(rule(), row("NET PAY", r.net_pay), rule(), "");

  lines.push(r.paid_at ? `Paid on ${dateLabel(r.paid_at)}.` : `Due on ${dateLabel(payDueDate(r.period))}.`);
  lines.push("This is a system generated payslip.");

  return lines.join("\n");
}
