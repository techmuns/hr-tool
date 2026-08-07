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

/** Shown as the payslip header. The only place the company name is spelled out. */
export const COMPANY_NAME = "Muns";

const ACCENT = "#2a78d6"; // matches --primary in the app's own theme
const ACCENT_SOFT = "#eaf2fc";
const INK = "#0b0b0b";
const MUTED = "#52514e";
const BORDER = "#e5e5e2";
const CANVAS = "#f0f2f5";
const DEDUCT = "#c0392b";

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

/**
 * Escapes text interpolated into the card. employee_name and job_title are
 * free text an employee or HR typed, not markup this module controls — a
 * stray `<` or `&` in either must not be able to break the layout.
 */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function metaRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:5px 0;font-size:12px;color:${MUTED};text-transform:uppercase;letter-spacing:.05em;">${label}</td>
    <td style="padding:5px 0;font-size:14px;color:${INK};text-align:right;">${value}</td>
  </tr>`;
}

function lineRow(label: string, amount: number, opts: { total?: boolean; color?: string } = {}): string {
  const weight = opts.total ? "font-weight:bold;" : "";
  const border = opts.total ? `border-top:1px solid ${BORDER};` : "";
  const color = opts.color ?? INK;
  return `<tr>
    <td style="padding:8px 0;${border}${weight}font-size:14px;color:${color};">${label}</td>
    <td style="padding:8px 0;${border}${weight}font-size:14px;color:${color};text-align:right;">${money(amount)}</td>
  </tr>`;
}

function sectionHeader(title: string): string {
  return `<tr>
    <td colspan="2" style="padding:0 0 6px;border-bottom:2px solid ${BORDER};font-size:11px;font-weight:bold;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};">${title}</td>
  </tr>`;
}

/**
 * The payslip as an HTML card, for the `html` field of the Muns raw email API
 * (see ../email.ts). Renders as a single white card on a light canvas: a
 * branded header with a PAID/DUE status pill, an employee block, earnings and
 * deductions tables, and a highlighted net-pay band.
 */
export function payslipHtml(r: PayslipRow): string {
  const totalEarnings = r.base_salary + r.reimbursements;
  const badge = r.paid_at ? `Paid ${dateLabel(r.paid_at)}` : `Due ${dateLabel(payDueDate(r.period))}`;

  const earningsRows = [
    lineRow("Basic Pay", r.base_salary),
    // Only list reimbursements when there are any — an empty ₹0.00 line is noise.
    r.reimbursements > 0 ? lineRow("Reimbursements", r.reimbursements) : "",
    lineRow("Total Earnings", totalEarnings, { total: true }),
  ].join("");

  // Leave and manually-booked deductions are listed apart: seeing one lump sum
  // labelled "unpaid leave" when half of it was an advance recovery is exactly
  // the sort of thing that turns into a payroll query.
  const deductionRows =
    r.deductions > 0
      ? [
          r.leave_deductions > 0
            ? lineRow(`Unpaid Leave (${r.unpaid_days} day${r.unpaid_days === 1 ? "" : "s"})`, r.leave_deductions, {
                color: DEDUCT,
              })
            : "",
          r.other_deductions > 0 ? lineRow("Other Deductions", r.other_deductions, { color: DEDUCT }) : "",
          lineRow("Total Deductions", r.deductions, { total: true, color: DEDUCT }),
        ].join("")
      : `<tr><td colspan="2" style="padding:8px 0;font-size:14px;color:${MUTED};">No deductions this period.</td></tr>`;

  const html = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS};">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;font-family:Arial,Helvetica,sans-serif;">
          <tr>
            <td style="background:${ACCENT};padding:24px;border-radius:12px 12px 0 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle">
                    <div style="color:#ffffff;font-size:21px;font-weight:bold;">${COMPANY_NAME}</div>
                    <div style="color:#dceafc;font-size:12px;text-transform:uppercase;letter-spacing:.06em;margin-top:3px;">Monthly Payslip · ${cycleLabel(r.period)}</div>
                  </td>
                  <td valign="middle" align="right">
                    <span style="display:inline-block;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,0.2);color:#ffffff;font-size:11px;font-weight:bold;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap;">${badge}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 24px 4px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${metaRow("Employee", esc(r.employee_name))}
                ${metaRow("Designation", esc(r.job_title || "—"))}
                ${metaRow("Worked Days", String(r.paid_days))}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 24px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${sectionHeader("Earnings")}
                ${earningsRows}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:10px 24px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${sectionHeader("Deductions")}
                ${deductionRows}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${ACCENT_SOFT};border-radius:8px;">
                <tr>
                  <td style="padding:16px 20px;font-size:12px;font-weight:bold;letter-spacing:.05em;text-transform:uppercase;color:${ACCENT};">Net Pay</td>
                  <td style="padding:16px 20px;font-size:22px;font-weight:bold;color:${ACCENT};text-align:right;">${money(r.net_pay)}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 22px;border-top:1px solid ${BORDER};">
              <div style="padding-top:14px;font-size:12px;color:${MUTED};">This is a system generated payslip.</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;

  // Collapse pretty-printed markup to compact HTML. Safe because every line
  // break above falls between tags, never in the middle of visible text, so
  // this cannot weld two words together the way stripping all whitespace
  // indiscriminately could.
  return html.replace(/>\s+</g, "><").trim();
}
