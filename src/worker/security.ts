import type { Context, Next } from "hono";
import type { AppEnv } from "./auth";

/**
 * The only origin ever allowed to embed this app in an iframe. Kept in sync
 * with DEFAULT_ALLOWED_HOST_ORIGINS in src/web/lib/sdk.ts — that's the only
 * origin allowed to postMessage a session (including the JWT) INTO this app
 * once embedded, so it's also the only origin with any legitimate reason to
 * embed it in the first place. Blocking every other origin from framing this
 * app at all is defense in depth on top of the postMessage origin check:
 * it closes off clickjacking/UI-redress against the framing itself, not just
 * forged messages. If Munshot ever embeds from another muns.io subdomain,
 * add its exact origin here AND to sdk.ts.
 */
const FRAME_ANCESTORS = ["https://chat.muns.io"];

/** Applied to every response — API and static assets alike — via app.use("*", ...) in index.ts. */
export async function securityHeaders(c: Context<AppEnv>, next: Next) {
  await next();
  c.header("Content-Security-Policy", `frame-ancestors ${FRAME_ANCESTORS.join(" ")}`);
}
