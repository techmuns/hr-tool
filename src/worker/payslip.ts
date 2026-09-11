/**
 * Payslip rendering for the monthly payroll email.
 *
 * The Muns raw email API's documented request shapes are two separate,
 * mutually exclusive bodies: {email, subject, text} for plain text, or
 * {email, subject, html} for a real rendered document — "only one body type
 * per request." An earlier attempt at HTML never actually sent that clean
 * shape: it sent `text` and `html` together, then markup crammed into `text`
 * alone, and concluded from those failures that the API could not render HTML
 * at all. Neither of those is the documented shape, so that conclusion was
 * drawn from an untried case. This sends exactly {email, subject, html} — see
 * ../email.ts — with nothing accompanying it.
 *
 * The card below is a fragment, not a full document: the API drops whichever
 * body is sent into a message envelope of its own, so <html>/<head>/<body>
 * here would only nest. It is table-based with every rule inlined, because
 * mail clients strip <style> blocks and support neither flexbox nor grid —
 * tables are the layout primitive that survives Gmail, Outlook and Apple Mail
 * alike. Single-column and fluid-width (a wrapper at width="100%" clamped with
 * a CSS max-width, per the same clients' handling of a fixed width="600"
 * attribute) rather than anything relying on a @media breakpoint, since mobile
 * clients that strip <style> would drop that breakpoint too.
 */

import { MUNSHOT_LOGO_DATA_URI } from "./munshotLogo";
import { COMPANY_NAME, COMPANY_ADDRESS, BUSINESS_UNIT, BRAND_COLORS } from "./brand";
import { escapeHtml } from "./htmlEscape";
import type { EmploymentType } from "./types";

export { COMPANY_NAME };

const { NAVY, GOLD, GOLD_SOFT_ON_DARK, GOLD_DEEP, GOLD_TINT, INK, MUTED, BORDER } = BRAND_COLORS;
const CANVAS = "#f0f2f5";
/** Payslip-specific, not part of the brand identity — deduction amounts only. */
const DEDUCT = "#c0392b";

/**
 * Exported as one object — rather than importing eight loose constants — so
 * the "Download PDF" button's jsPDF rendering (src/web/payslipPdf.ts) draws
 * with the exact same hex values as this HTML card instead of a hand-copied
 * set that could drift from it.
 */
export const PAYSLIP_COLORS = { NAVY, GOLD, GOLD_DEEP, GOLD_TINT, INK, MUTED, BORDER, DEDUCT };

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

/**
 * The inverse of payCycle: which period a given date is billed under. A cycle
 * runs 11th-to-10th, so the 10th and earlier still belong to the month's own
 * period while the 11th onwards has rolled into the next one.
 */
export function periodForDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return iso.slice(0, 7);
  // Date normalises a 13th month into January of the following year.
  const d = new Date(Date.UTC(year, month - 1 + (day >= 11 ? 1 : 0), 1));
  return d.toISOString().slice(0, 7);
}

/**
 * Step a "YYYY-MM" period by whole months — the arithmetic behind moving from
 * one cycle to the next, or back to the one before. Date normalises the year
 * boundary, so shiftPeriod("2026-01", -1) is "2025-12".
 */
export function shiftPeriod(period: string, months: number): string {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return period;
  return new Date(Date.UTC(year, month - 1 + months, 1)).toISOString().slice(0, 7);
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
  employee_id: number;
  employee_name: string;
  job_title: string;
  employment_type: EmploymentType;
  date_of_joining: string;
  location: string;
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
  return `Salary Slip — ${salaryMonthLabel(period)}`;
}

/** "2026-08" -> "August - 2026", the month a payslip is titled for. */
export function salaryMonthLabel(period: string): string {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return period;
  const name = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    month: "long",
  });
  return `${name} - ${year}`;
}

/** Whole-rupee (or rupee.paise) amount from paise, e.g. 1000000 -> "10,000.00". */
const inrPlain = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function rupeesPlain(paise: number): string {
  return inrPlain.format(paise / 100);
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven",
  "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

/** 0–999 in words, with the Indian "And" before a sub-hundred remainder. */
function under1000(n: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest) {
    if (parts.length) parts.push("And");
    parts.push(rest < 20 ? ONES[rest] : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? " " + ONES[rest % 10] : ""}`);
  }
  return parts.join(" ");
}

/**
 * A paise amount as Indian-numbering words, e.g. 176626700 ->
 * "Seventeen Lakh Sixty Six Thousand Two Hundred And Sixty Seven Rupees Only".
 * Handles paise as a trailing "and NN Paise" when present.
 */
export function rupeesInWords(paise: number): string {
  const rupees = Math.floor(Math.abs(paise) / 100);
  const paiseRem = Math.abs(paise) % 100;

  let words: string;
  if (rupees === 0) {
    words = "Zero";
  } else {
    const crore = Math.floor(rupees / 10000000);
    const lakh = Math.floor((rupees % 10000000) / 100000);
    const thousand = Math.floor((rupees % 100000) / 1000);
    const belowThousand = rupees % 1000;
    const segs: string[] = [];
    if (crore) segs.push(`${under1000(crore)} Crore`);
    if (lakh) segs.push(`${under1000(lakh)} Lakh`);
    if (thousand) segs.push(`${under1000(thousand)} Thousand`);
    if (belowThousand) {
      // The "And" that reads "...Thousand Two Hundred And..." only belongs when
      // there is a higher segment before it and the remainder is under 100.
      if (segs.length && belowThousand < 100) segs.push("And");
      segs.push(under1000(belowThousand));
    }
    words = segs.join(" ");
  }

  const rupeePart = `${words} Rupee${rupees === 1 ? "" : "s"}`;
  const paisePart = paiseRem ? ` And ${under1000(paiseRem)} Paise` : "";
  return `${rupeePart}${paisePart} Only`;
}

export interface PayslipField {
  label: string;
  value: string;
}
/** One earnings or deductions line; `amount` is in paise. */
export interface PayslipLine {
  label: string;
  amount: number;
}

export interface PayslipModel {
  company: { name: string; address: string; businessUnit: string };
  /** "Salary Slip for August - 2026". */
  title: string;
  /** Employee detail grid, rendered two pairs per row. */
  fields: PayslipField[];
  earnings: PayslipLine[];
  deductions: PayslipLine[];
  /** All in paise. */
  gross: number;
  totalDeductions: number;
  netPay: number;
  amountInWords: string;
  note: string;
}

const NA = "N.A.";

const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  employee: "Full Time",
  freelancer: "Freelancer",
  intern: "Intern",
};

/**
 * The single source of truth for what a payslip shows, shared by the emailed
 * HTML (payslipHtml, below) and the downloadable PDF (../web/payslipPdf.ts) so
 * the two can never drift. The layout mirrors a standard Indian salary slip;
 * fields this tool doesn't track (PF, ESIC, UAN, PAN, sub-department, arrears)
 * are shown as N.A. rather than dropped, so the format stays intact.
 */
export function payslipModel(r: PayslipRow): PayslipModel {
  const daysInMonth = r.paid_days + r.unpaid_days; // company standard working days (24)
  const status = r.paid_at ? `Paid ${dateLabel(r.paid_at)}` : `Due ${dateLabel(payDueDate(r.period))}`;

  const fields: PayslipField[] = [
    { label: "Employee Name", value: r.employee_name },
    { label: "Employee Type", value: EMPLOYMENT_TYPE_LABEL[r.employment_type] ?? "Full Time" },
    { label: "Employee Code", value: `EMP${String(r.employee_id).padStart(4, "0")}` },
    { label: "Designation", value: r.job_title || NA },
    { label: "Duration", value: cycleLabel(r.period) },
    { label: "Sub Department", value: NA },
    { label: "Date of Joining", value: r.date_of_joining ? dateLabel(r.date_of_joining) : NA },
    { label: "No. of Days in Month", value: String(daysInMonth) },
    { label: "Working Days", value: String(r.paid_days) },
    { label: "LOP (days)", value: String(r.unpaid_days) },
    { label: "Provident Fund", value: NA },
    { label: "ESIC Number", value: NA },
    { label: "Current Office Location", value: r.location || NA },
    { label: "Total Arrear Days", value: "0" },
    { label: "UAN No", value: NA },
    { label: "PAN No", value: NA },
    { label: "Payment Status", value: status },
  ];

  const earnings: PayslipLine[] = [{ label: "Basic", amount: r.base_salary }];
  if (r.reimbursements > 0) earnings.push({ label: "Reimbursements", amount: r.reimbursements });

  const deductions: PayslipLine[] = [];
  if (r.leave_deductions > 0) {
    deductions.push({
      label: `Unpaid Leave (${r.unpaid_days} day${r.unpaid_days === 1 ? "" : "s"})`,
      amount: r.leave_deductions,
    });
  }
  if (r.other_deductions > 0) deductions.push({ label: "Other Deductions", amount: r.other_deductions });

  return {
    company: { name: COMPANY_NAME, address: COMPANY_ADDRESS, businessUnit: BUSINESS_UNIT },
    title: `Salary Slip for ${salaryMonthLabel(r.period)}`,
    fields,
    earnings,
    deductions,
    gross: r.base_salary + r.reimbursements,
    totalDeductions: r.deductions,
    netPay: r.net_pay,
    amountInWords: rupeesInWords(r.net_pay),
    note: "This is a Computer Generated Slip and does not require signature.",
  };
}

/**
 * The payslip as an HTML document for the `html` field of the Muns raw email
 * API (see ../email.ts). A bordered, table-based salary slip — company header,
 * a titled slip line, a two-column employee-details grid, an
 * earnings/deductions table, the A/B/net-pay rows with the amount in words, and
 * a footer note. Every rule is inlined and the layout is tables, since mail
 * clients strip <style> and don't do flexbox/grid.
 */
export function payslipHtml(r: PayslipRow): string {
  const m = payslipModel(r);
  const LINE = "#c2c6cc";
  const cell = `border:1px solid ${LINE};`;
  const pad = "padding:7px 10px;";
  const headFill = "background:#f2f3f5;";

  const addressLines = [
    m.company.address
      ? `<div style="font-size:12px;color:${MUTED};margin-top:4px;"><b style="color:${INK};">Office Address :</b> ${escapeHtml(m.company.address)}</div>`
      : "",
    m.company.businessUnit
      ? `<div style="font-size:12px;color:${MUTED};margin-top:2px;"><b style="color:${INK};">Business Unit :</b> ${escapeHtml(m.company.businessUnit)}</div>`
      : "",
  ].join("");

  // Employee detail grid — two label:value pairs per row; pad an odd tail.
  const fieldCell = (f?: PayslipField): string =>
    f
      ? `<td width="50%" style="${cell}${pad}font-size:13px;color:${MUTED};">${escapeHtml(f.label)} : <b style="color:${INK};">${escapeHtml(f.value)}</b></td>`
      : `<td style="${cell}"></td>`;
  const fieldRows: string[] = [];
  for (let i = 0; i < m.fields.length; i += 2) {
    fieldRows.push(`<tr>${fieldCell(m.fields[i])}${fieldCell(m.fields[i + 1])}</tr>`);
  }

  // Earnings | Deductions — four columns, one row per pair, shorter side padded.
  const amt = (p: number) => rupeesPlain(p);
  const edCell = (text: string, opts: { right?: boolean; bold?: boolean } = {}) =>
    `<td style="${cell}${pad}font-size:13px;color:${INK};${opts.right ? "text-align:right;" : ""}${opts.bold ? "font-weight:bold;" : ""}">${text}</td>`;
  const edRows: string[] = [];
  const maxLen = Math.max(m.earnings.length, m.deductions.length);
  for (let i = 0; i < maxLen; i++) {
    const e = m.earnings[i];
    const d = m.deductions[i];
    edRows.push(
      `<tr>${edCell(e ? escapeHtml(e.label) : "")}${edCell(e ? amt(e.amount) : "", { right: true })}` +
        `${edCell(d ? escapeHtml(d.label) : "")}${edCell(d ? amt(d.amount) : "", { right: true })}</tr>`,
    );
  }

  const html = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:760px;margin:0 auto;background:#ffffff;border:1px solid ${LINE};font-family:Arial,Helvetica,sans-serif;">
    <tr>
      <td width="150" style="${cell}text-align:center;vertical-align:middle;padding:12px;">
        <img src="${MUNSHOT_LOGO_DATA_URI}" width="58" height="58" alt="${escapeHtml(m.company.name)}" style="display:inline-block;border-radius:8px;">
      </td>
      <td style="${cell}padding:12px 16px;vertical-align:middle;">
        <div style="font-size:22px;font-weight:bold;color:${INK};">${escapeHtml(m.company.name)}</div>
        ${addressLines}
      </td>
    </tr>
    <tr>
      <td colspan="2" style="${cell}text-align:center;padding:11px;font-size:16px;color:${INK};">${escapeHtml(m.title)}</td>
    </tr>
    <tr>
      <td colspan="2" style="padding:0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${fieldRows.join("")}</table>
      </td>
    </tr>
    <tr>
      <td colspan="2" style="padding:0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            <td colspan="2" style="${cell}${pad}${headFill}text-align:center;font-weight:bold;color:${INK};">Earnings</td>
            <td colspan="2" style="${cell}${pad}${headFill}text-align:center;font-weight:bold;color:${INK};">Deductions</td>
          </tr>
          <tr>
            <td style="${cell}${pad}${headFill}font-size:12px;font-weight:bold;color:${MUTED};">Components</td>
            <td style="${cell}${pad}${headFill}font-size:12px;font-weight:bold;color:${MUTED};text-align:right;">Amount (Rs.)</td>
            <td style="${cell}${pad}${headFill}font-size:12px;font-weight:bold;color:${MUTED};">Common Deductions</td>
            <td style="${cell}${pad}${headFill}font-size:12px;font-weight:bold;color:${MUTED};text-align:right;">Amount (Rs.)</td>
          </tr>
          ${edRows.join("")}
          <tr>
            ${edCell("Gross Earning (A)", { bold: true })}${edCell(amt(m.gross), { right: true, bold: true })}
            ${edCell("Total Deductions (B)", { bold: true })}${edCell(amt(m.totalDeductions), { right: true, bold: true })}
          </tr>
          <tr>
            ${edCell("Net Pay (A - B)", { bold: true })}${edCell(amt(m.netPay), { right: true, bold: true })}
            <td colspan="2" style="${cell}"></td>
          </tr>
          <tr>
            ${edCell("Total Pay", { bold: true })}${edCell(amt(m.netPay), { right: true, bold: true })}
            <td colspan="2" style="${cell}${pad}font-size:13px;color:${INK};text-align:right;">${escapeHtml(m.amountInWords)}</td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td colspan="2" style="${cell}text-align:center;padding:9px;font-size:12px;color:${MUTED};"><b style="color:${INK};">Note:</b> ${escapeHtml(m.note)}</td>
    </tr>
  </table>`;

  // Collapse pretty-printed markup to compact HTML. Safe because every line
  // break falls between tags, never in the middle of visible text.
  return html.replace(/>\s+</g, "><").trim();
}
