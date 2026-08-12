import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { Login } from "./components/Login";
import { AdminUnlock } from "./components/AdminUnlock";
import { EmployeeDashboard } from "./employee/EmployeeDashboard";
import { ClockPage } from "./employee/ClockPage";
import { AdminDashboard } from "./admin/AdminDashboard";
import { clearSession, getSession, setSession } from "./session";
import { api, clearApiCache, getAdminSessionStatus } from "./api";
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

type AdminSessionState = "checking" | "locked" | "unlocked";

/**
 * Fronts AdminArea with the admin-password gate. The base (OTP/host) session
 * having role="admin" only means this employee IS HR/founder — it says
 * nothing about whether THIS browser has completed the separate admin-session
 * handshake (see /auth/admin-login). That state lives only in the HttpOnly
 * admin_session cookie, so it's re-checked with the server on every mount
 * rather than inferred from anything in localStorage.
 */
function AdminGate({ tier, employeeId }: { tier: Tier; employeeId: number }) {
  const [state, setState] = useState<AdminSessionState>("checking");

  useEffect(() => {
    let cancelled = false;
    setState("checking");
    getAdminSessionStatus()
      .then((res) => {
        if (cancelled) return;
        // A leftover admin_session cookie from a PREVIOUS employee (e.g. the
        // Munshot host handed off to a different logged-in user in this same
        // browser) must not unlock admin access for the CURRENT one — only
        // treat it as unlocked when it actually belongs to employeeId.
        setState(res.authenticated && res.employee.id === employeeId ? "unlocked" : "locked");
      })
      .catch(() => {
        if (!cancelled) setState("locked");
      });
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  if (state === "checking") return <Centered>Checking admin session…</Centered>;
  if (state === "locked") return <AdminUnlock onUnlocked={() => setState("unlocked")} />;
  return <AdminArea tier={tier} />;
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

  function refresh() {
    setSessionState(getSession());
  }

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
      .post<{ role: EmployeeRole; employee: Employee }>("/login", { text: email })
      .then((data) => {
        clearApiCache();
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
    return <AdminGate tier={session.tier} employeeId={session.employeeId} />;
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
