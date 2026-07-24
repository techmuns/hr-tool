import { useEffect, useRef, useState, type ReactNode } from "react";
import { Login } from "./components/Login";
import { EmployeeDashboard } from "./employee/EmployeeDashboard";
import { ClockPage } from "./employee/ClockPage";
import { AdminDashboard } from "./admin/AdminDashboard";
import { clearSession, getSession, setSession } from "./session";
import { api, clearApiCache } from "./api";
import { useHostContext } from "./hooks/useHostContext";
import type { SessionContext } from "./lib/sdk";
import type { Employee, EmployeeRole } from "./types";

/** True when the URL path is /clock — the quick-clock entry point. */
function isClockRoute(): boolean {
  return window.location.pathname.replace(/\/+$/, "") === "/clock";
}

function Centered({ children }: { children: ReactNode }) {
  return <div style={{ padding: 16, color: "#9ca3af", fontSize: 13 }}>{children}</div>;
}

type HostStatus = "idle" | "resolving" | "done" | "error";

function HrApp({ host }: { host: SessionContext }) {
  const [session, setSessionState] = useState(getSession());
  // If the Munshot host already told us who the user is, resolve that identity
  // before showing anything, so we never flash the previous local user.
  const [hostStatus, setHostStatus] = useState<HostStatus>(() => (host.email ? "resolving" : "idle"));
  const [hostError, setHostError] = useState<string | null>(null);
  const resolvedEmail = useRef<string | null>(null);

  function refresh() {
    setSessionState(getSession());
  }

  function logout() {
    clearApiCache();
    clearSession();
    refresh();
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
    return <Login onLoggedIn={refresh} />;
  }

  // /clock: shows just the clock in/out card.
  if (isClockRoute()) {
    return <ClockPage />;
  }

  if (session.role === "admin") {
    return <AdminDashboard onLogout={logout} />;
  }

  return <EmployeeDashboard />;
}

export default function App() {
  const { session } = useHostContext();
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    if (!session.token) return;
    console.info("[dashboard] token:", session.token);
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
