import { useEffect, useState } from "react";
import { Login } from "./components/Login";
import { EmployeeDashboard } from "./employee/EmployeeDashboard";
import { ClockPage } from "./employee/ClockPage";
import { AdminDashboard } from "./admin/AdminDashboard";
import { clearSession, getSession } from "./session";
import { useHostContext } from "./hooks/useHostContext";

/** True when the URL path is /clock — the quick-clock entry point. */
function isClockRoute(): boolean {
  return window.location.pathname.replace(/\/+$/, "") === "/clock";
}

function HrApp() {
  const [session, setSessionState] = useState(getSession());

  function refresh() {
    setSessionState(getSession());
  }

  function logout() {
    clearSession();
    refresh();
  }

  if (!session) {
    return <Login onLoggedIn={refresh} />;
  }

  // /clock: auto-uses the saved session and shows just the clock in/out card.
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
    return <div style={{ padding: 16, color: "#9ca3af", fontSize: 13 }}>Waiting for session…</div>;
  }

  return <HrApp />;
}
