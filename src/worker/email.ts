import type { Bindings } from "./auth";

const MUNS_RAW_EMAIL_URL = "https://devde.muns.io/email/send/raw";

export interface RawEmail {
  email: string;
  subject: string;
  text: string;
}

/**
 * Sends a plain-text email through the Muns raw email API.
 * The bearer token is read from the MUNS_TOKEN Workers secret — never hardcode it.
 * Set it with: `wrangler secret put MUNS_TOKEN` (and in .dev.vars for local dev).
 *
 * The API does not render HTML: a payslip with real markup in the body came
 * back with the tags visible as literal text, so it escapes the body rather
 * than parsing it. It does convert \n to <br>, and — because the result is
 * still an HTML document under the hood — plain ASCII spaces in the body
 * collapse under normal HTML whitespace rules. payslip.ts pads with U+00A0
 * for that reason; this function has nothing else to route around it.
 */
export async function sendRawEmail(env: Bindings, msg: RawEmail): Promise<void> {
  const token = env.MUNS_TOKEN;
  if (!token) {
    throw new Error("MUNS_TOKEN is not configured");
  }

  const res = await fetch(MUNS_RAW_EMAIL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(msg),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Email send failed (${res.status})${body ? `: ${body}` : ""}`);
  }
}
