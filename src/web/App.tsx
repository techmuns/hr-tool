import { useEffect, useState } from "react";
import { EmployeeDashboard } from "./employee/EmployeeDashboard";
import { AdminDashboard } from "./admin/AdminDashboard";
import { api } from "./api";
import { clearSession, getSession, setSession, type Session } from "./session";
import { useHostContext } from "./hooks/useHostContext";
import type { Employee, EmployeeRole } from "./types";

function WaitingState({ message, isError = false }: { message: string; isError?: boolean }) {
  return (
    <div style={{ padding: 16, color: isError ? "#dc2626" : "#9ca3af", fontSize: 13 }}>{message}</div>
  );
}

// Resolves + reconciles the app's employee identity against the email the
// Munshot host asserts for the current user. Never trusts a cached identity
// for a different email — that mismatch is exactly what let one person's
// browser show another employee's private data.
function HrApp({ email }: { email: string }) {
  const [session, setSessionState] = useState<Session | null>(getSession());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session && session.email === email) return;
    let cancelled = false;
    setError(null);
    api
      .post<{ role: EmployeeRole; employee: Employee }>("/login", { email })
      .then((data) => {
        if (cancelled) return;
        const next: Session = { role: data.role, employeeId: data.employee.id, tier: data.employee.tier, email };
        setSession(next);
        setSessionState(next);
      })
      .catch((err) => {
        if (cancelled) return;
        clearSession();
        setSessionState(null);
        setError(err instanceof Error ? err.message : "Failed to sign in");
      });
    return () => {
      cancelled = true;
    };
  }, [email, session]);

  function logout() {
    clearSession();
    setSessionState(null);
  }

  if (error) return <WaitingState message={error} isError />;
  if (!session || session.email !== email) return <WaitingState message="Signing you in…" />;

  if (session.role === "admin") {
    return <AdminDashboard onLogout={logout} />;
  }
  return <EmployeeDashboard />;
}

export default function App() {
  const { session } = useHostContext();

  useEffect(() => {
    if (!session.token) return;
    console.info("[dashboard] token:", session.token);
  }, [session.token]);

  if (!session.token || !session.email) {
    return <WaitingState message="Waiting for session…" />;
  }

  return <HrApp email={session.email} />;
}
