import { useEffect, useState } from "react";
import { ClockCard } from "./ClockCard";
import { ThemeToggle } from "../components/ThemeToggle";
import { Login } from "../components/Login";
import { api } from "../api";
import { clearSession } from "../session";

type AuthState = "checking" | "authenticated" | "unauthenticated";

/**
 * Minimal standalone quick-clock page served at /clock, meant to be
 * bookmarked and opened directly. App.tsx only reaches this route once the
 * local (localStorage) session hint exists, but that hint is no longer the
 * credential itself (see src/worker/employeeSession.ts) — it can outlive the
 * real server-side session (cookie expired, cleared, or never established on
 * this browser). Re-verify with the server on every mount rather than trust
 * the hint, so a stale one falls back to the same OTP login instead of
 * rendering straight into a wall of "Not authenticated" errors.
 */
export function ClockPage() {
  const [auth, setAuth] = useState<AuthState>("checking");

  useEffect(() => {
    let cancelled = false;
    api
      .get("/me")
      .then(() => {
        if (!cancelled) setAuth("authenticated");
      })
      .catch(() => {
        if (cancelled) return;
        clearSession();
        setAuth("unauthenticated");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (auth === "checking") {
    return (
      <div className="clock-page">
        <div className="clock-page-inner">
          <p style={{ color: "#9ca3af", fontSize: 13 }}>Checking session…</p>
        </div>
      </div>
    );
  }

  if (auth === "unauthenticated") {
    return <Login onLoggedIn={() => setAuth("authenticated")} />;
  }

  return (
    <div className="clock-page">
      <div className="clock-page-inner">
        <div className="clock-page-top">
          <span className="clock-page-title">Quick Clock</span>
          <ThemeToggle />
        </div>
        <ClockCard />
        <a className="clock-page-link" href="/">Open full dashboard →</a>
      </div>
    </div>
  );
}
