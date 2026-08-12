// src/hooks/useHostContext.ts
import { useEffect, useState } from "react";
import { ALLOWED_HOST_ORIGINS, sdk, type DashboardSdkEnvelope, type SessionContext } from "../lib/sdk";
import { isTrustedOrigin, isValidSessionPayload } from "../lib/hostMessageGuard";

const EMPTY_SESSION: SessionContext = {
  token: null,
  userName: null,
  email: null,
  orgId: null,
  orgName: null,
};

/**
 * The only piece of host context this HR tool uses is the session (who's logged
 * in). The host is a market dashboard that streams ticker/market updates many
 * times a second; we deliberately do NOT track those — reading them would
 * re-render the whole app on every tick for data nothing here shows. So this
 * watches host messages but only ever updates state when the SESSION actually
 * changes, and keeps the same object reference otherwise so React (and the
 * memoized HrApp) can bail out. On a busy host that's the difference between
 * re-rendering thousands of times a second and not at all.
 *
 * Every message this hook can see directly (i.e. everything after this
 * component mounts) is independently origin- and shape-checked here, on top
 * of whatever the vendor SDK itself enforces via allowedOrigins (sdk.ts) — see
 * that file for why the very first host:init, cached before mount, can't be
 * re-checked on this side of the SDK boundary.
 */
export function useHostContext() {
  const [session, setSession] = useState<SessionContext>(EMPTY_SESSION);

  useEffect(() => {
    const applySession = (rawSession: unknown) => {
      if (!isValidSessionPayload(rawSession)) {
        console.warn("[dashboard] Ignoring malformed host session payload");
        return;
      }
      setSession((prev) => {
        const next = { ...EMPTY_SESSION, ...rawSession };
        const unchanged =
          prev.token === next.token &&
          prev.userName === next.userName &&
          prev.email === next.email &&
          prev.orgId === next.orgId &&
          prev.orgName === next.orgName;
        return unchanged ? prev : next;
      });
    };

    // Apply already-cached context (host:init may have arrived — and been
    // accepted by the vendor SDK's own origin check — before this component
    // mounted, so there's no MessageEvent left here to re-validate the origin
    // of; see sdk.ts).
    const ctx = sdk.getContext();
    if (ctx?.session) applySession(ctx.session);

    // Every later message DOES carry its origin, so re-verify it independently
    // rather than trusting the vendor SDK's own filtering alone.
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
