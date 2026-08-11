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

export function useHostContext() {
  const [session, setSession] = useState<SessionContext>(EMPTY_SESSION);
  const [ticker, setTicker] = useState<string | null>(null);
  const [tickerCompany, setTickerCompany] = useState<string | null>(null);
  const [tickerCountry, setTickerCountry] = useState<string | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      const ctx = sdk.getContext();
      if (!ctx) return;
      if (ctx.session) {
        // Keep the SAME object reference when nothing actually changed. The host
        // can emit many messages a second (market ticks etc.); without this,
        // each one built a fresh session object and re-rendered the whole
        // dashboard — cheap per render, but it compounds with the employee
        // view's once-a-second clock and can peg a long-lived embedded tab.
        // Returning `prev` lets React (and the memoized HrApp) bail out.
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
      }
      if (ctx.market) {
        setTicker(ctx.market.selectedTicker ?? null);
        setTickerCompany(ctx.market.selectedTickerCompany ?? null);
        setTickerCountry(ctx.market.selectedTickerCountry ?? null);
        setSelectedSymbol(ctx.market.selectedSymbol ?? null);
      }
    };

    sync();                    // apply already-cached context (host:init may
                               // have arrived before this component mounted)
    return sdk.onMessage(sync); // re-sync on every host message; returns unsub
  }, []);

  return { session, ticker, tickerCompany, tickerCountry, selectedSymbol };
}
