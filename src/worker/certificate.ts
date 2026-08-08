/**
 * Certificate rendering — leaving certificates and letters of recommendation,
 * emailed as an HTML card exactly like a payslip (see ./payslip.ts and
 * ./email.ts for why: the Muns raw email API takes {email, subject, html} as
 * one of its two documented, mutually exclusive body shapes).
 *
 * Placeholder wording: the letter body itself is written per-issue by
 * whoever fills out the Certificates tab (see DEFAULT_BODY below for the
 * starting text they edit), not fixed here — there is no single correct
 * leaving-certificate or LOR wording, and the company's actual preferred
 * phrasing/layout was going to be supplied as a reference format. Swapping
 * DEFAULT_BODY's copy, or the fixed salutation/closing in certificateHtml,
 * for that format is a small edit once it's in hand — nothing else about the
 * plumbing (storage, email, PDF) depends on the exact words.
 */

import { MUNSHOT_LOGO_DATA_URI } from "./munshotLogo";
import { COMPANY_NAME, BRAND_COLORS } from "./brand";
import { escapeHtml } from "./htmlEscape";
import type { Certificate, CertificateType } from "./types";

const { NAVY, GOLD, GOLD_SOFT_ON_DARK, INK, MUTED, BORDER } = BRAND_COLORS;

export const CERTIFICATE_TYPE_LABEL: Record<CertificateType, string> = {
  leaving: "Leaving Certificate",
  lor: "Letter of Recommendation",
};

/** "2026-08-11" -> "11 Aug 2026". Same normalisation payslip.ts's dateLabel uses. */
function dateLabel(iso: string): string {
  const d = new Date(iso.length > 10 ? iso.replace(" ", "T") + "Z" : `${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
}

/**
 * A reasonable starting letter for the given type, filled in with what's
 * already known about the employee — HR edits this (or replaces it outright)
 * before sending, so it only needs to be a sensible first draft, not the
 * final wording.
 */
export function defaultCertificateBody(
  type: CertificateType,
  fields: { employee_name: string; job_title: string; date_of_joining: string | null; last_working_day: string | null },
): string {
  const name = fields.employee_name;
  const role = fields.job_title || "their role";
  const joined = fields.date_of_joining ? dateLabel(fields.date_of_joining) : "their date of joining";

  if (type === "leaving") {
    const left = fields.last_working_day ? dateLabel(fields.last_working_day) : "their last working day";
    return `This is to certify that ${name} was employed with ${COMPANY_NAME} as ${role} from ${joined} to ${left}.\n\nDuring this period, ${name} was found to be sincere, hardworking and maintained good conduct. We place on record our appreciation for their contribution and wish them success in all future endeavors.`;
  }

  return `I am pleased to recommend ${name}, who worked with ${COMPANY_NAME} as ${role}, starting ${joined}.\n\nDuring their time with us, ${name} consistently demonstrated strong skills, professionalism and a positive attitude, and was a valuable member of the team. I recommend ${name} without reservation for any opportunity they pursue.`;
}

export function certificateSubject(type: CertificateType): string {
  return `${COMPANY_NAME} — ${CERTIFICATE_TYPE_LABEL[type]}`;
}

/**
 * Splits on blank lines into paragraphs (mirroring how the issue form's
 * textarea is edited — a blank line between paragraphs), escapes each one,
 * then turns any remaining single newline into a line break within it.
 * Escaping happens before the <br> substitution so the substitution can't be
 * neutralised by user text that happens to contain the same literal tag.
 */
function renderBody(body: string): string {
  return body
    .split(/\n\s*\n/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p style="margin:0 0 14px;">${escapeHtml(para).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * The certificate as an HTML card, for the `html` field of the Muns raw email
 * API. Same visual language as the payslip card — branded header with an
 * "Issued <date>" pill, white body — but the content underneath is a letter,
 * not a table.
 */
export function certificateHtml(cert: Certificate): string {
  const html = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f2f5;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;font-family:Arial,Helvetica,sans-serif;">
          <tr>
            <td style="background:${NAVY};padding:24px;border-radius:12px 12px 0 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="44" valign="top" style="padding-right:12px;">
                    <img src="${MUNSHOT_LOGO_DATA_URI}" width="36" height="36" alt="${COMPANY_NAME}" style="display:block;">
                  </td>
                  <td valign="top">
                    <div style="color:${GOLD};font-size:21px;font-weight:bold;">${COMPANY_NAME}</div>
                    <div style="color:#c9bfa3;font-size:12px;text-transform:uppercase;letter-spacing:.06em;margin-top:3px;">${CERTIFICATE_TYPE_LABEL[cert.type]}</div>
                    <div style="margin-top:10px;">
                      <span style="display:inline-block;padding:6px 12px;border-radius:999px;background:${GOLD_SOFT_ON_DARK};border:1px solid rgba(232,194,106,0.4);color:${GOLD};font-size:11px;font-weight:bold;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap;">Issued ${dateLabel(cert.created_at)}</span>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px;font-size:14px;line-height:1.6;color:${INK};">
              <div>To Whomsoever It May Concern,</div>
              <div style="margin-top:16px;">
                ${renderBody(cert.body)}
              </div>
              <div style="margin-top:10px;">Sincerely,</div>
              <div style="margin-top:26px;font-weight:bold;color:${INK};">${COMPANY_NAME}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 22px;border-top:1px solid ${BORDER};">
              <div style="padding-top:14px;font-size:12px;color:${MUTED};">This is a system generated certificate.</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;

  return html.replace(/>\s+</g, "><").trim();
}
