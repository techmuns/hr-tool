import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { Login } from "./components/Login";
import { EmployeeDashboard } from "./employee/EmployeeDashboard";
import { ClockPage } from "./employee/ClockPage";
import { AdminDashboard } from "./admin/AdminDashboard";
import { clearSession, getSession, getToken, saveToken, setSession } from "./session";
import { api, clearApiCache, resolveIdentity, SESSION_EXPIRED_EVENT } from "./api";
import { useHostContext } from "./hooks/useHostContext";
import type { SessionContext } from "./lib/sdk";
import type { Employee, EmployeeRole, Tier } from "./types";

/** True when the URL path is /clock — the quick-clock entry point. */
function isClockRoute(): boolean {
  return window.location.pathname.replace(/\/+$/, "") === "/clock";
}

function Centered({ children }: { children: ReactNode }) {
  return <div style={{ padding: 16, color: "#9ca3af", fontSize: 13 }}>{children}</div>;
}

type HostStatus = "idle" | "resolving" | "done" | "error";

type AdminViewMode = "admin" | "employee";

/**
 * Wraps the admin experience with a topbar view switcher: an admin (HR or
 * founder) can flip into a live preview of the employee screen — the actual
 * EmployeeDashboard, acting as themselves — and back, without leaving their
 * session. Plain employees never reach here, so they never see the switch.
 */
function AdminArea({ tier }: { tier: Tier }) {
  const [mode, setMode] = useState<AdminViewMode>("admin");
  const switcher = (
    <select
      className="view-switch"
      style={{ width: "auto" }}
      value={mode}
      onChange={(e) => setMode(e.target.value as AdminViewMode)}
      aria-label="Switch between admin and employee view"
      title="Switch view"
    >
      <option value="admin">{tier === "founder" ? "Founder view" : "HR view"}</option>
      <option value="employee">Employee view</option>
    </select>
  );

  return mode === "employee" ? (
    <EmployeeDashboard topbarExtra={switcher} />
  ) : (
    <AdminDashboard topbarExtra={switcher} />
  );
}

// Memoized so a host message that changes only market/ticker context — not the
// session — doesn't re-render the entire dashboard. Paired with the stable
// session reference from useHostContext (see hooks/useHostContext.ts).
const HrApp = memo(function HrApp({ host }: { host: SessionContext }) {
  const hasToken = !!host.token;
  const [session, setSessionState] = useState(getSession());
  // If the Munshot host already told us who the user is, resolve that identity
  // before showing anything, so we never flash the previous local user.
  const [hostStatus, setHostStatus] = useState<HostStatus>(() => (host.email ? "resolving" : "idle"));
  const [hostError, setHostError] = useState<string | null>(null);
  const resolvedEmail = useRef<string | null>(null);

  // Standalone cold load: identity is never persisted (only the opaque token
  // is), so on a fresh page we hold a token but no in-memory identity yet. Ask
  // the server who the token belongs to before rendering. Skipped entirely when
  // the host is providing identity — the host-identity effect below owns that.
  const bootFromToken = !host.email && !host.token;
  const [booting, setBooting] = useState<boolean>(() => bootFromToken && !getSession() && !!getToken());

  useEffect(() => {
    if (!bootFromToken || getSession() || !getToken()) {
      setBooting(false);
      return;
    }
    let cancelled = false;
    setBooting(true);
    resolveIdentity().then((id) => {
      if (cancelled) return;
      setSessionState(id);
      setBooting(false);
    });
    return () => {
      cancelled = true;
    };
  }, [bootFromToken]);

  function refresh() {
    setSessionState(getSession());
  }

  // A 401 anywhere means the local session no longer matches a real employee
  // (deleted, or stale from another deploy) — api.ts already cleared it;
  // drop it here too and send the person back through login rather than
  // leaving the UI stuck showing "Not authenticated" on every card.
  useEffect(() => {
    function onSessionExpired() {
      setSessionState(null);
      if (host.email) {
        // Let the host-identity effect below re-run and try logging back in.
        resolvedEmail.current = null;
        setHostStatus("resolving");
        setHostError(null);
      }
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
  }, [host.email]);

  // Embedded: sign in as the Munshot-authenticated user, identified by the
  // email the host provides. This overrides any stale local (OTP) session so
  // the dashboard always shows the person Munshot logged in — not whoever last
  // used this browser.
  useEffect(() => {
    const email = host.email;
    if (!email) return;
    if (resolvedEmail.current === email) return;
    resolvedEmail.current = email;
    setHostStatus("resolving");
    setHostError(null);
    api
      .post<{ token: string; role: EmployeeRole; employee: Employee }>("/login", { text: email })
      .then((data) => {
        clearApiCache();
        // Persist only the opaque token; identity stays in memory for the UI.
        saveToken(data.token);
        setSession({ role: data.role, employeeId: data.employee.id, tier: data.employee.tier });
        setSessionState(getSession());
        setHostStatus("done");
      })
      .catch((err) => {
        clearSession();
        setSessionState(null);
        setHostError(
          err instanceof Error && err.message
            ? err.message
            : `No HR account for ${email}`,
        );
        setHostStatus("error");
      });
  }, [host.email]);

  // While the host identity is being resolved, don't render the previous user.
  if (host.email && hostStatus === "resolving") {
    return <Centered>Signing you in…</Centered>;
  }
  // Standalone: resolving the stored token into an identity on a cold load.
  if (bootFromToken && booting) {
    return <Centered>Signing you in…</Centered>;
  }
  if (host.email && hostStatus === "error") {
    return <Centered>Couldn’t sign you in: {hostError}</Centered>;
  }

  if (!session) {
    // The OTP login is ONLY for the no-token (standalone) case. When the host
    // passed a token, identity comes from the host — never fall back to OTP;
    // keep waiting for the host identity to resolve instead.
    if (hasToken) {
      return <Centered>Signing you in…</Centered>;
    }
    return <Login onLoggedIn={refresh} />;
  }

  // /clock: shows just the clock in/out card.
  if (isClockRoute()) {
    return <ClockPage />;
  }

  if (session.role === "admin") {
    return <AdminArea tier={session.tier} />;
  }

  return <EmployeeDashboard />;
});

export default function App() {
  const { session } = useHostContext();
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    if (!session.token) return;
    // Never log the token itself — it's a bearer credential for Munshot's own
    // APIs. This is presence-only, for confirming the host handshake happened.
    console.info("[dashboard] host session token received", {
      email: session.email,
      userName: session.userName,
    });
  }, [session.token]);

  // When embedded in the Munshot host, host:init delivers a session token
  // shortly after mount. When opened standalone (directly, or from a device
  // outside the host) there is no host to send one — so instead of waiting
  // forever, fall back to the app's own login after a brief grace period.
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  const embedded = window.self !== window.top;

  if (!session.token && embedded && !waited) {
    return <Centered>Waiting for session…</Centered>;
  }

  return <HrApp host={session} />;
}
