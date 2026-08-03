import type { Bindings } from "./auth";

const MUNS_RAW_EMAIL_URL = "https://devde.muns.io/email/send/raw";

export interface RawEmail {
  email: string;
  subject: string;
  /** Plain-text body. Always sent — it is the fallback when `html` is dropped. */
  text: string;
  /**
   * Optional HTML body. The documented API shape is {email, subject, text}
   * only, and the endpoint authenticates before validating, so its handling of
   * an extra field could not be confirmed from outside. Sending it is therefore
   * best-effort: see the 400 retry below.
   */
  html?: string;
}

async function post(token: string, msg: RawEmail): Promise<Response> {
  return fetch(MUNS_RAW_EMAIL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(msg),
  });
}

/**
 * Sends an email through the Muns raw email API.
 * The bearer token is read from the MUNS_TOKEN Workers secret — never hardcode it.
 * Set it with: `wrangler secret put MUNS_TOKEN` (and in .dev.vars for local dev).
 *
 * If an `html` body is supplied and the API rejects the request as malformed
 * (400 — what a strict validator returns for an unrecognised field), the send is
 * retried once with text only. That way an API that doesn't take HTML degrades
 * to the plain-text payslip instead of failing outright.
 */
export async function sendRawEmail(env: Bindings, msg: RawEmail): Promise<void> {
  const token = env.MUNS_TOKEN;
  if (!token) {
    throw new Error("MUNS_TOKEN is not configured");
  }

  let res = await post(token, msg);

  if (res.status === 400 && msg.html) {
    const { html: _html, ...textOnly } = msg;
    res = await post(token, textOnly);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Email send failed (${res.status})${body ? `: ${body}` : ""}`);
  }
}
