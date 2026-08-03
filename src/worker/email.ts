import type { Bindings } from "./auth";

const MUNS_RAW_EMAIL_URL = "https://devde.muns.io/email/send/raw";

export interface RawEmail {
  email: string;
  subject: string;
  /**
   * The body the API actually sends. It may contain HTML markup.
   *
   * A delivered payslip showed runs of spaces collapsed to one while newlines
   * survived as line breaks — the signature of content placed into an HTML body
   * with \n turned into <br>. So `text` is what gets rendered, and markup put
   * here renders as markup. A sibling `html` field was ignored outright.
   */
  text: string;
  /**
   * Sent alongside in case the API ever grows real multipart support. Ignored
   * today, harmless to include, and dropped on the retry below.
   */
  html?: string;
  /**
   * Plain-text body to retry with if the rich attempt is rejected outright.
   * Never sent on the first attempt.
   */
  textFallback?: string;
}

/** Only email/subject/text/html go on the wire — textFallback is ours. */
function post(token: string, msg: RawEmail, opts: { plain?: boolean } = {}): Promise<Response> {
  const body = opts.plain
    ? { email: msg.email, subject: msg.subject, text: msg.textFallback ?? msg.text }
    : { email: msg.email, subject: msg.subject, text: msg.text, ...(msg.html ? { html: msg.html } : {}) };

  return fetch(MUNS_RAW_EMAIL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

/**
 * Sends an email through the Muns raw email API.
 * The bearer token is read from the MUNS_TOKEN Workers secret — never hardcode it.
 * Set it with: `wrangler secret put MUNS_TOKEN` (and in .dev.vars for local dev).
 *
 * If the API rejects the rich attempt as malformed (400 — what a strict
 * validator returns for an unrecognised field), the send is retried once with
 * the plain-text fallback and no extra fields, so a payslip still arrives.
 */
export async function sendRawEmail(env: Bindings, msg: RawEmail): Promise<void> {
  const token = env.MUNS_TOKEN;
  if (!token) {
    throw new Error("MUNS_TOKEN is not configured");
  }

  let res = await post(token, msg);

  if (res.status === 400 && (msg.html || msg.textFallback)) {
    res = await post(token, msg, { plain: true });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Email send failed (${res.status})${body ? `: ${body}` : ""}`);
  }
}
