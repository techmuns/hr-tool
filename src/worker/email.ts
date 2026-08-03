import type { Bindings } from "./auth";

const MUNS_RAW_EMAIL_URL = "https://devde.muns.io/email/send/raw";

export interface RawEmail {
  email: string;
  subject: string;
  /**
   * The body the API sends, and the only body field it accepts. It renders as
   * HTML: a delivered payslip showed runs of spaces collapsed to one while
   * newlines survived as line breaks, which is what happens to content dropped
   * into an HTML body with \n turned into <br>. So markup put here renders as
   * markup.
   */
  text: string;
  /**
   * Plain-text body to retry with if the first attempt is rejected as malformed.
   * Never sent unless that happens.
   */
  textFallback?: string;
}

/** textFallback is ours — only email/subject/text ever go on the wire. */
function post(token: string, msg: RawEmail, opts: { plain?: boolean } = {}): Promise<Response> {
  return fetch(MUNS_RAW_EMAIL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: msg.email,
      subject: msg.subject,
      text: opts.plain ? msg.textFallback ?? msg.text : msg.text,
    }),
  });
}

export interface SendOutcome {
  /** True when the first attempt was refused and the plain-text retry was used. */
  fellBack: boolean;
}

/**
 * Sends an email through the Muns raw email API.
 * The bearer token is read from the MUNS_TOKEN Workers secret — never hardcode it.
 * Set it with: `wrangler secret put MUNS_TOKEN` (and in .dev.vars for local dev).
 *
 * The request carries exactly the three documented fields. An earlier version
 * also sent an `html` field, hoping the API would prefer it; instead the API
 * refused the whole request with 400 — a strict validator rejecting a property
 * it does not know — and the retry below quietly delivered plain text. That
 * looked identical to success from the outside, which is why the caller is now
 * told when the fallback was used.
 */
export async function sendRawEmail(env: Bindings, msg: RawEmail): Promise<SendOutcome> {
  const token = env.MUNS_TOKEN;
  if (!token) {
    throw new Error("MUNS_TOKEN is not configured");
  }

  let res = await post(token, msg);
  let fellBack = false;

  if (res.status === 400 && msg.textFallback) {
    fellBack = true;
    res = await post(token, msg, { plain: true });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Email send failed (${res.status})${body ? `: ${body}` : ""}`);
  }

  return { fellBack };
}
