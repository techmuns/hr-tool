// src/hooks/useHostContext.ts
import { useEffect, useState } from "react";
import { sdk, type SessionContext } from "../lib/sdk";

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
 */
export function useHostContext() {
  const [session, setSession] = useState<SessionContext>(EMPTY_SESSION);

  useEffect(() => {
    const sync = () => {
      const ctx = sdk.getContext();
      if (!ctx?.session) return;
      setSession((prev) => {
        const next = { ...EMPTY_SESSION, ...ctx.session };
        const unchanged =
          prev.token === next.token &&
          prev.userName === next.userName &&
          prev.email === next.email &&
          prev.orgId === next.orgId &&
          prev.orgName === next.orgName;
        return unchanged ? prev : next;
      });
    };

    sync();                     // apply already-cached context (host:init may
                                // have arrived before this component mounted)
    return sdk.onMessage(sync); // re-sync on every host message; returns unsub
  }, []);

  return { session };
}
