import { useState } from "react";
import { Login } from "./components/Login";
import { EmployeeDashboard } from "./employee/EmployeeDashboard";
import { AdminDashboard } from "./admin/AdminDashboard";
import { clearSession, getSession } from "./session";

export default function App() {
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
