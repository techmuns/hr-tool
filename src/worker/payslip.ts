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
  /** First day covered, inclusive — the 11th of the period's own month. */
  start: string;
  /** Last day covered, inclusive — the 10th of the following month. */
  end: string;
  /** The day the money goes out: the 11th, right after the cycle closes. */
  payDate: string;
}

/**
 * The pay cycle a "YYYY-MM" period stands for. Billing runs 11th-to-10th, not
 * calendar months: period 2026-08 covers 11 Aug – 10 Sep 2026 and is paid on
 * 11 Sep. Everything that has to line up with a cycle — the unpaid-leave window,
 * the reimbursement window, the payslip header — derives from this one function.
 */
export function payCycle(period: string): PayCycle {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return { start: "", end: "", payDate: "" };
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  // `month` is 1-based and the Date argument is 0-based, so `month` on its own
  // already means "the following month".
  return {
    start: iso(new Date(Date.UTC(year, month - 1, 11))),
    end: iso(new Date(Date.UTC(year, month, 10))),
    payDate: iso(new Date(Date.UTC(year, month, 11))),
  };
}

/** The date a period's salaries are due — the 11th that closes the cycle. */
export function payDueDate(period: string): string {
  return payCycle(period).payDate;
}

/** "2026-08" -> "11 Aug – 10 Sep 2026", the span the payslip actually covers. */
export function cycleLabel(period: string): string {
  const { start, end } = payCycle(period);
  if (!start || !end) return period;
  const short = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
      timeZone: "UTC",
      day: "numeric",
      month: "short",
    });
  return `${short(start)} – ${short(end)} ${end.slice(0, 4)}`;
}

export interface PayslipRow {
  employee_name: string;
  job_title: string;
  team_name: string | null;
  date_of_joining: string;
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
  return `Payslip — ${cycleLabel(period)}`;
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
    `${COMPANY_NAME} — PAYSLIP`,
    "",
    field("Pay Period", cycleLabel(r.period)),
    field("Employee Name", r.employee_name),
    field("Designation", r.job_title || "—"),
    field("Department", r.team_name || "—"),
    field("Date of Joining", dateLabel(r.date_of_joining)),
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
