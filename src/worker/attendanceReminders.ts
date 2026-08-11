/**
 * Weekday attendance reminders.
 *
 * Cloudflare cron (see wrangler.jsonc `triggers.crons`) fires this on weekdays
 * around noon IST. For every attendance-tracked employee it checks whether they
 * clocked in on any of the last 3 working days (Mon–Fri, weekends skipped); if
 * they haven't, it emails them individually a gentle nudge to clock in.
 *
 * Dates are reckoned in UTC to match how `work_date` is stored (see
 * ../db.ts::todayISODate) — the app already treats a calendar day as its UTC
 * day everywhere else, so the reminder window must too.
 *
 * De-duping: `last_attendance_reminder_at` records the day we last reminded
 * someone. We send at most one reminder per absence streak — once someone is
 * flagged we don't nag them again until they clock in and then lapse afresh —
 * so a chronically-absent person gets a single nudge, not a daily one.
 */

import type { Bindings } from "./auth";
import { sendRawEmail } from "./email";
import { recentBusinessDaysBefore } from "./db";
import { COMPANY_NAME, BRAND_COLORS } from "./brand";
import { MUNSHOT_LOGO_DATA_URI } from "./munshotLogo";
import { escapeHtml } from "./htmlEscape";

/** How many recent working days with no clock-in trigger a reminder. */
const ABSENCE_THRESHOLD = 3;

interface ReminderCandidate {
  id: number;
  name: string;
  email: string;
  last_attendance_reminder_at: string | null;
}

export interface ReminderRunResult {
  skipped: "weekend" | null;
  sent: string[];
  failed: { name: string; error: string }[];
}

export interface ReminderOptions {
  /** Injectable clock, for testing. Defaults to now. */
  now?: Date;
  /**
   * True when HR triggered this by hand rather than the cron. A manual run
   * still respects the 3-working-day threshold and per-streak de-duping, but
   * skips the weekday-only guard — HR clicking "send now" on a Saturday means
   * they want it sent.
   */
  manual?: boolean;
}

/** Runs a single reminder pass. */
export async function runAttendanceReminders(
  env: Bindings,
  opts: ReminderOptions = {},
): Promise<ReminderRunResult> {
  const now = opts.now ?? new Date();
  const result: ReminderRunResult = { skipped: null, sent: [], failed: [] };

  // The scheduled job only runs on weekdays; guard here too so a mis-set cron
  // never emails on a weekend. A manual "send now" from HR bypasses this.
  const dow = now.getUTCDay();
  if (!opts.manual && (dow === 0 || dow === 6)) {
    result.skipped = "weekend";
    return result;
  }

  const today = now.toISOString().slice(0, 10);
  const targetDays = recentBusinessDaysBefore(today, ABSENCE_THRESHOLD);

  // The same population the admin attendance grid tracks (see AttendanceTable):
  // people who clock in — employees and HR — but not founders (who don't clock
  // in), freelancers, or anyone HR removed from the list. Only those with an
  // email on file can be reminded.
  const employees = await env.DB.prepare(
    `SELECT id, name, email, last_attendance_reminder_at
       FROM employees
      WHERE on_attendance = 1
        AND tier != 'founder'
        AND employment_type != 'freelancer'
        AND email IS NOT NULL AND email <> ''`,
  ).all<ReminderCandidate>();

  for (const emp of employees.results ?? []) {
    // Present on any of the target working days → nothing to remind about.
    const clockedIn = await env.DB.prepare(
      `SELECT 1 FROM attendance
        WHERE employee_id = ? AND clock_in IS NOT NULL
          AND work_date IN (${targetDays.map(() => "?").join(",")})
        LIMIT 1`,
    )
      .bind(emp.id, ...targetDays)
      .first();
    if (clockedIn) continue;

    // Their most recent clock-in ever (null if they've never clocked in). Used
    // only to tell absence streaks apart for de-duping.
    const last = await env.DB.prepare(
      "SELECT MAX(work_date) AS d FROM attendance WHERE employee_id = ? AND clock_in IS NOT NULL",
    )
      .bind(emp.id)
      .first<{ d: string | null }>();
    const lastClockIn = last?.d ?? null;

    // Already reminded during this same absence streak? A reminder counts as
    // "this streak" when it was sent after the last clock-in (or, for someone
    // who has never clocked in, whenever any reminder already went out).
    const reminded = emp.last_attendance_reminder_at;
    const alreadyReminded =
      reminded !== null && (lastClockIn === null ? true : reminded > lastClockIn);
    if (alreadyReminded) continue;

    try {
      await sendRawEmail(env, {
        email: emp.email,
        subject: `Reminder: please clock in on the ${COMPANY_NAME} HR portal`,
        html: reminderHtml(emp.name),
      });
      await env.DB.prepare(
        "UPDATE employees SET last_attendance_reminder_at = ? WHERE id = ?",
      )
        .bind(today, emp.id)
        .run();
      result.sent.push(emp.name);
    } catch (err) {
      const error = err instanceof Error ? err.message : "Send failed";
      console.error(`Attendance reminder failed for ${emp.name}:`, error);
      result.failed.push({ name: emp.name, error });
    }
  }

  return result;
}

const { NAVY, GOLD, INK, MUTED, BORDER, GOLD_TINT } = BRAND_COLORS;

/**
 * A small branded HTML card, built the same way as the payslip email
 * (src/worker/payslip.ts): a table-based fragment with every rule inlined,
 * since mail clients strip <style> blocks. The API wraps whatever we send in
 * its own message envelope, so this is a fragment, not a full document.
 */
function reminderHtml(name: string): string {
  const firstName = escapeHtml(name.trim().split(/\s+/)[0] || name);
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
            <p style="margin:0 0 14px;font-size:18px;font-weight:bold;color:${INK};">Time to clock in</p>
            <p style="margin:0 0 14px;font-size:14px;line-height:1.55;color:${INK};">Hi ${firstName},</p>
            <p style="margin:0 0 14px;font-size:14px;line-height:1.55;color:${INK};">
              Our records show you haven't clocked in on the ${COMPANY_NAME} HR portal for the last ${ABSENCE_THRESHOLD} working days. If you've been working, please remember to clock in so your attendance stays up to date.
            </p>
            <p style="margin:0 0 20px;font-size:13px;line-height:1.55;color:${MUTED};">
              Already on approved leave, or clocked in elsewhere? You can ignore this note.
            </p>
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
