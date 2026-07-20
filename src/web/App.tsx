import { useEffect, useState } from "react";
import { Login } from "./components/Login";
import { EmployeeDashboard } from "./employee/EmployeeDashboard";
import { AdminDashboard } from "./admin/AdminDashboard";
import { clearSession, getSession } from "./session";
import { useHostContext } from "./hooks/useHostContext";

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

  if (session.role === "admin") {
    return <AdminDashboard onLogout={logout} />;
  }

  return <EmployeeDashboard onLogout={logout} />;
}

export default function App() {
  const { session } = useHostContext();

  useEffect(() => {
    if (!session.token) return;
    console.info("[dashboard] token:", session.token);
  }, [session.token]);

  if (!session.token) {
    return <div style={{ padding: 16, color: "#9ca3af", fontSize: 13 }}>Waiting for session…</div>;
  }

  return <HrApp />;
}
