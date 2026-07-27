import { useCallback, useEffect, useState } from "react";
import { Login } from "./components/Login";
import { EmployeeDashboard } from "./employee/EmployeeDashboard";
import { AdminDashboard } from "./admin/AdminDashboard";
import { clearSession, setSession } from "./session";
import { useHostContext } from "./hooks/useHostContext";
import { api } from "./api";
import { clearAppToken, getBearer, setHostToken } from "./authToken";
import type { EmployeeWithTeam } from "./types";

export default function App() {
  const { session } = useHostContext();
  // undefined = still resolving; null = not signed in; object = signed in.
  const [me, setMe] = useState<EmployeeWithTeam | null | undefined>(undefined);

  // Mirror the Munshot host JWT into the in-memory bearer source.
  useEffect(() => {
    setHostToken(session.token);
  }, [session.token]);

  const loadMe = useCallback(async () => {
    if (!getBearer()) {
      setMe(null);
      return;
    }
    try {
      const emp = await api.get<EmployeeWithTeam>("/me");
      // Cache role/tier for UI gating only — the server is the source of truth.
      setSession({ role: emp.role, employeeId: emp.id, tier: emp.tier });
      setMe(emp);
    } catch {
      clearSession();
      setMe(null);
    }
  }, []);

  // Resolve identity whenever a credential becomes available (host token may
  // arrive after mount via postMessage).
  useEffect(() => {
    loadMe();
  }, [session.token, loadMe]);

  function logout() {
    clearSession();
    clearAppToken();
    setMe(null);
  }

  if (me === undefined) {
    return <div style={{ padding: 16, color: "#9ca3af", fontSize: 13 }}>Signing in…</div>;
  }

  if (!me) {
    return <Login onLoggedIn={loadMe} />;
  }

  if (me.role === "admin") {
    return <AdminDashboard onLogout={logout} />;
  }

  return <EmployeeDashboard />;
}
