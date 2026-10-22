/**
 * Leave-applied notification.
 *
 * When an employee marks leave (see routes/leave.ts `POST /leave`), the leave
 * is immediately effective — there's no approval step. This emails a heads-up to
 * the person who needs to know, naming who applied and for which dates.
 *
 * Sending is fire-and-forget from the route (via `ctx.waitUntil`): marking leave
 * must succeed for the employee even if this email can't go out, exactly as the
 * attendance-reminder job tolerates a failed send. Any error is logged, never
 * surfaced to the applicant.
 *
 * Dates are stored as UTC calendar days ("YYYY-MM-DD", see ../db.ts), so they're
 * formatted here with a UTC-locked formatter — using the device/runtime zone
 * would shift the day and misreport the leave.
 */

import type { Bindings } from "./auth";
import { sendRawEmail } from "./email";
import { COMPANY_NAME, BRAND_COLORS } from "./brand";
import { MUNSHOT_LOGO_DATA_URI } from "./munshotLogo";
import { escapeHtml } from "./htmlEscape";

/**
 * Where the leave heads-up is sent. Production recipient is ceekay@muns.io;
 * during testing it goes to nadamsaluja@gmail.com — swap the two lines below to
 * cut over. Kept as a single constant so there's one place to change.
 */
const LEAVE_NOTIFY_EMAIL = "nadamsaluja@gmail.com";
// const LEAVE_NOTIFY_EMAIL = "ceekay@muns.io";

export interface LeaveNotificationDetails {
  /** Who applied. */
  employeeName: string;
  /** Their email, shown so the recipient can follow up. Optional. */
  employeeEmail: string;
  /** The business days taken, oldest→newest ("YYYY-MM-DD"). */
  dates: string[];
  /** Paid/unpaid split the server assigned. */
  paid: number;
  unpaid: number;
  /** The reason the employee typed, if any. */
  reason: string;
}

/** e.g. "22 Oct 2026" — UTC-locked so a YYYY-MM-DD day isn't shifted. */
function formatLeaveDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "22 Oct 2026" for a single day, or "22 Oct 2026 – 24 Oct 2026" for a span. */
function formatRange(dates: string[]): string {
  if (dates.length === 0) return "—";
  const first = formatLeaveDate(dates[0]);
  const last = formatLeaveDate(dates[dates.length - 1]);
  return first === last ? first : `${first} – ${last}`;
}

/**
 * Email the leave heads-up. Throws on send failure so the caller can log it;
 * the caller must not let that failure block the leave submission.
 */
export async function sendLeaveNotification(
  env: Bindings,
  details: LeaveNotificationDetails,
): Promise<void> {
  await sendRawEmail(env, {
    email: LEAVE_NOTIFY_EMAIL,
    subject: `Leave applied: ${details.employeeName}`,
    html: leaveNotificationHtml(details),
  });
}

const { NAVY, GOLD, INK, MUTED, BORDER, GOLD_TINT } = BRAND_COLORS;

/**
 * A small branded HTML card, built like the attendance-reminder email
 * (src/worker/attendanceReminders.ts): a table-based fragment with every rule
 * inlined, since mail clients strip <style> blocks. The API wraps whatever we
 * send in its own message envelope, so this is a fragment, not a full document.
 */
function leaveNotificationHtml(details: LeaveNotificationDetails): string {
  const name = escapeHtml(details.employeeName);
  const email = escapeHtml(details.employeeEmail);
  const range = escapeHtml(formatRange(details.dates));
  const total = details.dates.length;
  const dayWord = total === 1 ? "day" : "days";

  // Breakdown line only when there's a mix worth spelling out.
  const splitParts: string[] = [];
  if (details.paid > 0) splitParts.push(`${details.paid} paid`);
  if (details.unpaid > 0) splitParts.push(`${details.unpaid} unpaid`);
  const split = splitParts.join(" · ");

  const reasonRow = details.reason.trim()
    ? `<tr>
            <td style="padding:6px 0;font-size:14px;color:${MUTED};width:120px;vertical-align:top;">Reason</td>
            <td style="padding:6px 0;font-size:14px;color:${INK};">${escapeHtml(details.reason.trim())}</td>
          </tr>`
    : "";

  const emailRow = email
    ? `<tr>
            <td style="padding:6px 0;font-size:14px;color:${MUTED};width:120px;vertical-align:top;">Email</td>
            <td style="padding:6px 0;font-size:14px;color:${INK};">${email}</td>
          </tr>`
    : "";

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${GOLD_TINT};margin:0;padding:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid ${BORDER};border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
        <tr>
          <td style="background:${NAVY};padding:20px 28px;">
            <img src="${MUNSHOT_LOGO_DATA_URI}" width="36" height="36" alt="${COMPANY_NAME}" style="display:block;border:0;" />
          </td>
        </tr>
        <tr>
          <td style="padding:28px;">
            <p style="margin:0 0 14px;font-size:18px;font-weight:bold;color:${INK};">Leave applied</p>
            <p style="margin:0 0 18px;font-size:14px;line-height:1.55;color:${INK};">
              <strong>${name}</strong> has applied for leave on the ${COMPANY_NAME} HR portal.
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${BORDER};border-bottom:1px solid ${BORDER};margin:0 0 20px;">
              ${emailRow}
              <tr>
            <td style="padding:6px 0;font-size:14px;color:${MUTED};width:120px;vertical-align:top;">Dates</td>
            <td style="padding:6px 0;font-size:14px;color:${INK};">${range}</td>
          </tr>
              <tr>
            <td style="padding:6px 0;font-size:14px;color:${MUTED};width:120px;vertical-align:top;">Days</td>
            <td style="padding:6px 0;font-size:14px;color:${INK};">${total} ${dayWord}${split ? ` (${split})` : ""}</td>
          </tr>
              ${reasonRow}
            </table>
            <p style="margin:0;font-size:13px;color:${MUTED};border-top:1px solid ${BORDER};padding-top:16px;">
              <span style="color:${GOLD};font-weight:bold;">${COMPANY_NAME}</span> · HR Tool
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`.trim();
}
