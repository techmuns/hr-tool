# One-shot prompt: accept the Munshot JWT from the host iframe

Paste everything below the line into any dashboard project (or hand it to a
coding agent working in that project). It is self-contained: it describes the
whole handshake, the exact vendor-SDK behaviour it depends on, the code to
write, the failure modes, and the acceptance checks.

The facts in the appendix were read out of the shipped bundle
(`munshot-dashboard-sdk.v1.0.0.min.js`), not guessed — keep them accurate if
you re-derive this for a newer SDK version.

---

## TASK

Make this dashboard take its user session (JWT + identity) automatically from
the Munshot host that embeds it in an iframe, and accept it **only** from
Munshot's own origin. No login screen, no token in the URL, no manual paste.
When the app is not embedded, it must degrade gracefully instead of hanging.

Assume the dashboard is a web app (React examples below; the SDK layer is
framework-agnostic) served over HTTPS and embedded by Munshot at
`https://chat.muns.io`.

### 0. Non-negotiables

1. Load the Munshot Dashboard SDK from its script tag. Do **not** hand-roll
   `window.addEventListener("message", ...)` as the primary transport.
2. Create exactly **one** SDK client, at **module scope** (import time), before
   any UI mounts.
3. Always pass a **non-empty** `allowedOrigins` array of exact scheme+host
   origins. This is the entire trust boundary.
4. Re-check `origin` and payload shape yourself on every message you can see,
   on top of what the SDK does.
5. Never persist the token, never log it, never put it in a URL, never send it
   anywhere except Munshot's own APIs as an `Authorization: Bearer` header.
6. `session.token === null` is a normal, transient state — show a small
   inline waiting state, never a full-page error.

### 1. Load the SDK

Add to `index.html` `<head>`, before your app bundle:

```html
<script src="https://munshot.s3.ap-south-1.amazonaws.com/SDK+script/munshot-dashboard-sdk.v1.0.0.min.js"></script>
```

It is a classic (non-module) script that installs a global. Loading it as
`type="module"` or with `defer` after your bundle risks the client being
created after `host:init` has already arrived.

### 2. Create ONE client at module scope

The host sends `host:init` — the message that carries the first JWT — within
milliseconds of the iframe loading. The SDK only starts listening when the
client is constructed. So construct it at import time, never inside
`useEffect`/`onMounted`/a route handler.

Two consequences you must design around:

- If the client is created late, **the message is gone**. The host does not
  re-send `host:init`, and there is no way to ask for it (see appendix: only
  `host:init` establishes the `channelId`; `requestContext()` cannot fire
  before that).
- If the client is created late but the SDK still got it (because the SDK was
  constructed at import time while your component mounted later), the
  *envelope* is gone but the *context is cached*. So your consumer must read
  `sdk.getContext()` once on mount **and then** subscribe — reading only one of
  the two is a bug.

`src/lib/sdk.ts` — copy this, change the two constants and the origin list:

```ts
export const DASHBOARD_ID = "your-dashboard-id";     // <-- set per dashboard
export const DASHBOARD_NAME = "Your Dashboard Name"; // <-- set per dashboard

function parseOriginList(raw: string | undefined): string[] {
  return (raw ?? "").split(",").map((o) => o.trim()).filter(Boolean);
}

/**
 * Exact scheme+host of every origin allowed to postMessage a session into
 * this app. Hardcoded (not just env-driven) so a build that forgets the env
 * var still fails closed to a real allow-list instead of an empty one — an
 * empty list is NOT safe here (see the allowedOrigins note below).
 */
const DEFAULT_ALLOWED_HOST_ORIGINS = ["https://chat.muns.io"];

const envOrigins = parseOriginList(
  import.meta.env.VITE_MUNSHOT_ALLOWED_ORIGINS as string | undefined,
);
export const ALLOWED_HOST_ORIGINS = envOrigins.length
  ? envOrigins
  : DEFAULT_ALLOWED_HOST_ORIGINS;

export interface SessionContext {
  token: string | null;    // JWT bearer token for Munshot APIs
  userName: string | null; // "Rahul Sharma"
  email: string | null;    // "rahul@acme.com"
  orgId: string | null;
  orgName: string | null;
}

export interface MarketContext {
  selectedTicker: string | null;        // "AAPL"
  selectedTickerCompany: string | null; // "Apple Inc."
  selectedTickerCountry: string | null; // "US"
  selectedSymbol: string | null;        // TradingView format, "NASDAQ:AAPL"
}

export interface DashboardHostContext {
  session?: SessionContext;
  market?: MarketContext;
  app?: { route: string | null; query: string | null; viewMode: string | null;
          selectedCategory: string | null; searchQuery: string | null };
}

export interface DashboardSdkEnvelope {
  namespace: string;   // always "munshot-dashboard-sdk"
  version: string;
  channelId: string;
  source: "host" | "dashboard";
  kind: string;        // "host:init" | "host:context:update" | "host:event" | ...
  timestamp: number;
  requestId?: string;
  payload?: any;
}

export interface DashboardClientSdk {
  getContext(): DashboardHostContext | null;
  getChannelId(): string | null;
  onMessage(h: (env: DashboardSdkEnvelope, meta: { origin: string }) => void): () => void;
  onTopic(topic: string, h: (t: any, meta: any, env: DashboardSdkEnvelope) => void): () => void;
  onRequest(topic: string, h: (t: any, meta: any, env: DashboardSdkEnvelope) => unknown | Promise<unknown>): () => void;
  ready(): boolean;
  requestContext(): boolean;
  publish(topic: string, data?: unknown, metadata?: unknown): boolean;
  request(topic: string, data?: unknown, options?: { timeoutMs?: number; metadata?: unknown }): Promise<any>;
  sendError(message: string, code?: string, details?: unknown): boolean;
  destroy(): void;
}

interface CreateClientConfig {
  dashboardId: string;
  dashboardName?: string;
  autoReady?: boolean;                  // default true — leave it
  requestTimeoutMs?: number;            // default 15000
  maxPayloadBytes?: number;             // default 524288 (512 KB)
  lockOriginOnFirstMessage?: boolean;   // default true
  allowedOrigins?: string[];            // MUST be non-empty
  targetWindow?: Window | null;         // default window.parent ?? window.opener
  targetOrigin?: string;                // default "*", locked to host on init
}

declare global {
  interface Window {
    MunshotDashboardSDK?: {
      createDashboardClientSdk?: (c: CreateClientConfig) => DashboardClientSdk;
      createClient?: (c: CreateClientConfig) => DashboardClientSdk;
      DashboardClientSdk?: new (c: CreateClientConfig) => DashboardClientSdk;
      Client?: new (c: CreateClientConfig) => DashboardClientSdk;
    };
  }
}

// Used ONLY when the SDK script is absent (running standalone, outside the
// Munshot host). Return types match the real client so app code is identical.
function createNoopSdk(): DashboardClientSdk {
  return {
    getContext: () => null,
    getChannelId: () => null,
    onMessage: () => () => {},
    onTopic: () => () => {},
    onRequest: () => () => {},
    ready: () => false,
    requestContext: () => false,
    publish: () => false,
    request: async () => null,
    sendError: () => false,
    destroy: () => {},
  };
}

function initSdk(): DashboardClientSdk {
  const g = window.MunshotDashboardSDK;
  const config: CreateClientConfig = {
    dashboardId: DASHBOARD_ID,
    dashboardName: DASHBOARD_NAME,
    // Leave autoReady default (true): the SDK sends dashboard:ready itself
    // from inside its host:init handler, once it knows the channelId.
    lockOriginOnFirstMessage: true,
    // Only spread when non-empty — see "empty array fails OPEN" below.
    ...(ALLOWED_HOST_ORIGINS.length ? { allowedOrigins: ALLOWED_HOST_ORIGINS } : {}),
  };

  // The global has been shipped under two shapes; try both before giving up.
  const factory = g?.createDashboardClientSdk ?? g?.createClient;
  if (typeof factory === "function") {
    try { return factory(config); } catch (err) { console.error("[dashboard] SDK factory failed", err); }
  }
  const Ctor = g?.DashboardClientSdk ?? g?.Client;
  if (typeof Ctor === "function") {
    try { return new Ctor(config); } catch (err) { console.error("[dashboard] SDK constructor failed", err); }
  }

  console.warn(
    "[dashboard] MunshotDashboardSDK not found; using no-op SDK. " +
      "Expected only when running outside the Munshot host iframe.",
  );
  return createNoopSdk();
}

// Single client for the whole app, created at import time so its message
// listener is live before host:init can arrive.
export const sdk: DashboardClientSdk = initSdk();
```

### 3. The origin allow-list is the entire trust boundary

A JWT arriving by `postMessage` is only trustworthy because of **where it came
from**. `MessageEvent.origin` is set by the browser (scheme + host + port, no
path, no trailing slash) and cannot be forged by the sender's payload — but
*any* page that can get a handle on your window can post to it. So:

- **List exact origins.** The SDK matches with `Set.has(origin)`. No wildcards,
  no subdomain matching, no path. `"*.muns.io"`, `"https://muns.io/"` and
  `"muns.io"` all silently match nothing.
- **Scheme and port count.** `http://chat.muns.io` ≠ `https://chat.muns.io`.
- **Never pass an empty array.** In the shipped SDK,
  `allowedOrigins: []` is treated the same as omitting it, and with
  `lockOriginOnFirstMessage` it then **accepts the first message from any
  origin** and locks to that origin. Empty fails *open*, not closed. Hence the
  hardcoded `DEFAULT_ALLOWED_HOST_ORIGINS` fallback and the conditional spread
  above: it must be impossible for a misconfigured build to ship an empty list.
- **Env var overrides, hardcoded default backs it up.** Ship
  `VITE_MUNSHOT_ALLOWED_ORIGINS=https://chat.muns.io` (comma-separated for
  several) and document it in `.env.example`.
- **New Munshot subdomain ⇒ new entry.** If Munshot starts embedding from
  another `muns.io` subdomain, add its exact origin to the list. Nothing else
  will make it work.

### 4. The context contract

The host owns login, session lifetime, and refresh. It pushes context to you:

| Kind | When | Payload |
| --- | --- | --- |
| `host:init` | Once, right after the iframe loads | `payload.context` = full context incl. `session.token` |
| `host:context:update` | Login, session refresh, logout, ticker change, nav change | `payload.context` = full replacement context |
| `host:event` | Host-side events on a topic | normalized `{topic, data, metadata}` |
| `host:request` | Host asks the dashboard for something (e.g. export) | answered by `sdk.onRequest(...)` |

Rules that follow from this:

- `session.token` is `null` before init and after logout. Treat `null` as
  "not yet / no longer", never as an error.
- `host:context:update` **replaces** the cached context wholesale; don't assume
  fields persist across updates — read them from the new context each time.
- The dashboard must react to updates live, without a reload.
- `sdk.getContext()` returns a **fresh deep clone on every call**, so object
  identity always changes. Compare **field by field** before setting state, or
  a host that streams ticker updates many times a second will re-render your
  whole app just as often.

### 5. Consume it (React)

`src/hooks/useHostContext.ts`:

```ts
import { useEffect, useState } from "react";
import { ALLOWED_HOST_ORIGINS, sdk, type DashboardSdkEnvelope, type SessionContext } from "../lib/sdk";
import { isTrustedOrigin, isValidSessionPayload } from "../lib/hostMessageGuard";

const EMPTY_SESSION: SessionContext = {
  token: null, userName: null, email: null, orgId: null, orgName: null,
};

export function useHostContext() {
  const [session, setSession] = useState<SessionContext>(EMPTY_SESSION);

  useEffect(() => {
    const applySession = (raw: unknown) => {
      if (!isValidSessionPayload(raw)) {
        console.warn("[dashboard] Ignoring malformed host session payload");
        return;
      }
      setSession((prev) => {
        const next = { ...EMPTY_SESSION, ...raw };
        const unchanged =
          prev.token === next.token &&
          prev.userName === next.userName &&
          prev.email === next.email &&
          prev.orgId === next.orgId &&
          prev.orgName === next.orgName;
        return unchanged ? prev : next; // stable reference => no re-render storm
      });
    };

    // 1. Already-cached context: host:init may have arrived (and been origin-
    //    checked by the SDK) before this component mounted, so there is no
    //    MessageEvent left to re-validate on this side of the SDK boundary.
    const ctx = sdk.getContext();
    if (ctx?.session) applySession(ctx.session);

    // 2. Every later message DOES carry its origin — re-verify independently.
    return sdk.onMessage((envelope: DashboardSdkEnvelope, meta: { origin: string }) => {
      if (!isTrustedOrigin(meta.origin, ALLOWED_HOST_ORIGINS)) {
        console.warn("[dashboard] Ignoring postMessage from untrusted origin:", meta.origin);
        return;
      }
      if (envelope.source !== "host") return;
      const ctx = sdk.getContext();
      if (ctx?.session) applySession(ctx.session);
    });
  }, []);

  return { session };
}
```

Non-React equivalent: call `sdk.getContext()` once at startup, then
`sdk.onMessage(...)` with the same two guards, and push into whatever store the
app uses. The `onMessage` return value is the unsubscribe function.

### 6. Validate independently (defense in depth)

You cannot audit the vendor bundle on every release, and the vendor's origin
check happens before your code ever runs. Keep your own pure, unit-testable
guards and apply them to everything you can see.

`src/lib/hostMessageGuard.ts`:

```ts
import type { SessionContext } from "./sdk";

export function isTrustedOrigin(origin: string, allowedOrigins: readonly string[]): boolean {
  if (!origin || allowedOrigins.length === 0) return false; // empty list => trust nothing
  return allowedOrigins.includes(origin);                   // exact match only
}

const MAX_EMAIL_LENGTH = 320; // RFC 5321 upper bound

/**
 * Structural check on the session payload a host message claims to carry.
 * This is not email validation for its own sake — it stops a malformed or
 * hostile payload smuggling something unexpected into the fields the app acts
 * on (identity lookups, headers, rendering).
 */
export function isValidSessionPayload(session: unknown): session is SessionContext {
  if (!session || typeof session !== "object") return false;
  const s = session as Record<string, unknown>;

  if (s.email !== null && s.email !== undefined) {
    if (typeof s.email !== "string") return false;
    if (s.email.length === 0 || s.email.length > MAX_EMAIL_LENGTH) return false;
    if (!s.email.includes("@")) return false;
  }
  for (const key of ["token", "userName", "orgId", "orgName"] as const) {
    if (s[key] !== null && s[key] !== undefined && typeof s[key] !== "string") return false;
  }
  return true;
}
```

### 7. Use the token

```ts
const res = await fetch(apiUrl, {
  headers: {
    Authorization: `Bearer ${session.token}`,
    "Content-Type": "application/json",
  },
});
```

- Put `session.token` in **every** dependency array alongside ticker/filters, so
  a refreshed session re-fetches automatically:
  `useEffect(() => { if (!ticker || !session.token) return; load(); }, [ticker, session.token]);`
- Gate fetches on the token being present rather than firing and 401-ing.
- Null token ⇒ small inline placeholder inside the affected widget:
  ```tsx
  if (!session.token) {
    return <div style={{ padding: 16, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>Waiting for session…</div>;
  }
  ```
- On logout the host pushes `token: null`. Clear cached user data and any
  in-memory derived state when the token goes from set to null.
- Log **presence**, never the value: `console.info("[dashboard] host session token received", { email, userName })`.

### 8. Standalone / not-embedded fallback

`window.self !== window.top` tells you whether you're framed. If you're framed
but no token has arrived, wait — briefly — then fall back rather than hanging
forever:

```tsx
export default function App() {
  const { session } = useHostContext();
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 1500);
    return () => clearTimeout(t);
  }, []);

  const embedded = window.self !== window.top;
  if (!session.token && embedded && !waited) return <Centered>Waiting for session…</Centered>;

  return <Dashboard host={session} />;
}
```

If the dashboard *also* has its own standalone sign-in (OTP, magic link),
the host session must win: when a host token/email is present, resolve identity
from the host and never fall back to the local login, so a stale local session
can't shadow the Munshot user.

### 9. Server-side rules (if the dashboard has its own backend)

The origin check is a **client-side** boundary. It stops a hostile page
injecting a session into the browser tab; it proves nothing to your server.

- **Verify the JWT server-side** — signature, `iss`, `aud`, `exp` — against
  Munshot's published key, or by calling a Munshot API with it. Never let a
  client-supplied email or an unverified token grant privileges.
- **CORS**: the dashboard's domain must be allow-listed server-side by Munshot
  for its APIs to accept your requests; the host forwards the token regardless
  of your domain, so a working token with failing calls usually means CORS.
- **Framing headers**: do not send `X-Frame-Options: DENY/SAMEORIGIN`; if you
  set CSP, it needs `frame-ancestors https://chat.muns.io;`. Otherwise the
  iframe never loads and no handshake happens at all.
- **Cookies** set by your own backend are third-party inside the iframe, so
  they need `Secure; SameSite=None`, plus `Partitioned` (CHIPS) to survive
  third-party-cookie blocking. `Lax`/`Strict` cookies are silently dropped.

### 10. Never

- Never build a login page, password form, or API-key box for the embedded case.
- Never store the JWT in `localStorage`/`sessionStorage`/cookies/URL.
- Never `console.log` the token or include it in error reports or analytics.
- Never send the token to any host other than Munshot's APIs.
- Never accept a session from `event.origin` you didn't list, and never widen
  the list "temporarily" to debug.
- Never use `postMessage(..., "*")` for anything carrying user data.
- Never call `sdk.destroy()` outside real teardown: only `host:init` establishes
  the channel, and the host will not send it again.

### 11. Tests to write

Pure-function tests need no DOM and are the highest-value ones:

```ts
expect(isTrustedOrigin("https://chat.muns.io", ALLOWED)).toBe(true);
expect(isTrustedOrigin("https://chat.muns.io.evil.example", ALLOWED)).toBe(false);
expect(isTrustedOrigin("http://chat.muns.io", ALLOWED)).toBe(false);   // scheme matters
expect(isTrustedOrigin("https://sub.chat.muns.io", ALLOWED)).toBe(false); // no subdomain match
expect(isTrustedOrigin("https://chat.muns.io", [])).toBe(false);       // fails closed
expect(isTrustedOrigin("", ALLOWED)).toBe(false);
expect(isTrustedOrigin("null", ALLOWED)).toBe(false);                  // sandboxed iframe origin

expect(isValidSessionPayload({ token: "jwt", email: "a@b.com" })).toBe(true);
expect(isValidSessionPayload({ token: null, email: null })).toBe(true);
expect(isValidSessionPayload("nope")).toBe(false);
expect(isValidSessionPayload({ email: "not-an-email" })).toBe(false);
expect(isValidSessionPayload({ email: 12345 })).toBe(false);
expect(isValidSessionPayload({ email: `${"a".repeat(400)}@x.com` })).toBe(false);
expect(isValidSessionPayload({ email: "a@b.com", token: 12345 })).toBe(false);
```

Also assert that the shipped allow-list is never empty:
`expect(ALLOWED_HOST_ORIGINS.length).toBeGreaterThan(0);`

### 12. Acceptance checklist

- [ ] SDK `<script>` in `index.html` `<head>`, before the app bundle.
- [ ] Exactly one client, created at module scope, with a non-empty
      `allowedOrigins` and `lockOriginOnFirstMessage: true`.
- [ ] Hardcoded default origin list + env override; empty list impossible.
- [ ] Consumer reads `sdk.getContext()` on mount **and** subscribes via
      `sdk.onMessage`.
- [ ] Every visible message re-checked for origin, `source === "host"`, and
      payload shape.
- [ ] Session state updates only when a field actually changed (stable ref).
- [ ] Token used as `Authorization: Bearer`, present in dependency arrays,
      never stored or logged.
- [ ] Null token renders an inline waiting state, not a full-page error.
- [ ] Logout (`token: null`) clears user-scoped state.
- [ ] Standalone (unframed) mode still runs, with a grace period before falling
      back.
- [ ] Backend verifies the JWT; CORS, `frame-ancestors`, and
      `SameSite=None; Secure; Partitioned` cookies configured.
- [ ] Guard unit tests pass, including look-alike-origin and empty-list cases.

---

## Appendix — verified behaviour of `munshot-dashboard-sdk.v1.0.0`

Read directly from the shipped bundle. Rely on these; re-verify for new versions.

- **Global shape.** The bundle assigns `window.MunshotDashboardSDK` twice: once
  as `{ namespace, version, createClient, Client }`, then as the module
  namespace `{ createDashboardClientSdk, DashboardClientSdk, … }`. Probe
  `createDashboardClientSdk ?? createClient`, then
  `DashboardClientSdk ?? Client`, and fall back to a no-op — that ordering
  works under either shape.
- **Origin check.** `shouldAcceptOrigin(origin)` returns
  `allowedOrigins.has(origin)` when a non-empty `allowedOrigins` was passed.
  Otherwise, when `lockOriginOnFirstMessage` is true (the default), it accepts
  the **first** message from any origin and pins the allow-list and
  `targetOrigin` to that sender. `allowedOrigins: []` is treated as "not
  provided" — it does not fail closed.
- **Envelope filter.** Messages must have
  `namespace === "munshot-dashboard-sdk"`, string `version`/`channelId`/`kind`,
  numeric `timestamp`, and `source === "host"`. Everything else is dropped.
- **`host:init` is special.** It is the only kind that sets `channelId`; it also
  re-points `targetWindow` at `event.source`, narrows `targetOrigin` from `"*"`
  to the host's origin, caches `payload.context`, emits to `onMessage`
  listeners, and (with `autoReady`) sends `dashboard:ready` for you. Every other
  kind is ignored unless its `channelId` matches — so a client that misses
  `host:init` is permanently deaf.
- **`getContext()` deep-clones** (`structuredClone`) on every call — new object
  identity each time. `host:context:update` replaces the cached context
  entirely.
- **`requestContext()` returns `false`** before `host:init` (no channel yet), so
  it cannot be used to bootstrap. `ready()` is the one message allowed to go out
  pre-channel.
- **Outbound.** `targetWindow` defaults to `window.parent` (or `window.opener`);
  `targetOrigin` defaults to `"*"` until `host:init` locks it. Pre-init, only
  `dashboard:ready` (dashboard id/name) can go out — no secrets. Set
  `targetOrigin` explicitly if you want strictness and have exactly one host
  origin.
- **Topics** are trimmed and lowercased; `onTopic("*")` / `onRequest("*")` are
  wildcards. `onRequest` replies to the first handler that returns and sends a
  `DASHBOARD_HANDLER_ERROR` response if it throws.
- **Limits.** `request()` times out after `requestTimeoutMs` (default 15000 ms).
  Outbound payloads are size-checked against `maxPayloadBytes` (default 512 KB)
  using `JSON.stringify` length, and cloned with `structuredClone` — so a
  `Blob` (e.g. a visual export snapshot) passes through structurally and does
  not count against the JSON size estimate.
- **The SDK does not verify the JWT.** It never parses or validates the token —
  origin is the only check. Anything privileged must be verified server-side.
