import { useEffect, useRef, useState } from "react";
import { Login } from "./components/Login";
import { EmployeeDashboard } from "./employee/EmployeeDashboard";
import { AdminDashboard } from "./admin/AdminDashboard";
import { api } from "./api";
import { clearSession, getSession, setSession, type Session } from "./session";
import { useHostContext } from "./hooks/useHostContext";
import { hostEmail, tierForEmail, type Tier } from "./hostAuth";
import type { Employee, EmployeeRole } from "./types";

// The classic SDK <script> in index.html sets this global before the app
// bundle runs. Its presence tells us we're embedded in the Munshot host
// (a token is coming) vs. running standalone (no token ever will).
const isEmbedded = typeof window !== "undefined" && !!window.MunshotDashboardSDK;

function DashboardForTier({ tier, onLogout }: { tier: Tier; onLogout?: () => void }) {
  if (tier === "employee") {
    return <EmployeeDashboard onLogout={onLogout} />;
  }
  return <AdminDashboard onLogout={onLogout} tier={tier} showFeedback={tier === "founder"} />;
}

function ManualApp() {
  const [session, setSessionState] = useState<Session | null>(() => {
    const existing = getSession();
    if (existing?.viaHost) {
      // Leftover from a previous embedded run — never reuse a host-resolved
      // identity in standalone mode.
      clearSession();
      return null;
    }
    return existing;
  });

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

  const tier: Tier = session.tier ?? (session.role === "admin" ? "founder" : "employee");
  return <DashboardForTier tier={tier} onLogout={logout} />;
}

type HostAuthState =
  | { status: "resolving" }
  | { status: "signed-in"; tier: Tier }
  | { status: "not-provisioned" };

export default function App() {
  const { session: hostSession } = useHostContext();
  const [hostAuth, setHostAuth] = useState<HostAuthState>({ status: "resolving" });
  const resolvedToken = useRef<string | null>(null);

  useEffect(() => {
    if (!hostSession.token) {
      // No token (yet, or the host just logged us out). Drop any
      // previously resolved identity so a stale employeeId never leaks
      // into a different person's session once a new token arrives.
      resolvedToken.current = null;
      clearSession();
      setHostAuth({ status: "resolving" });
      return;
    }
    if (resolvedToken.current === hostSession.token) return;
    resolvedToken.current = hostSession.token;

    const email = hostEmail(hostSession);
    const tier = tierForEmail(email);

    (async () => {
      try {
        if (tier === "employee") {
          if (!email) {
            setHostAuth({ status: "not-provisioned" });
            return;
          }
          const data = await api.post<{ role: EmployeeRole; employee: Employee }>("/login", { email });
          setSession({ role: "employee", employeeId: data.employee.id, tier, viaHost: true });
          setHostAuth({ status: "signed-in", tier });
          return;
        }

        // hr / founder: being in the code list is the authorization. Land
        // on their own seeded record when possible, otherwise fall back to
        // the shared admin identity.
        let resolved: Employee;
        try {
          const data = await api.post<{ role: EmployeeRole; employee: Employee }>("/login", { email });
          resolved = data.employee;
        } catch {
          const data = await api.post<{ role: EmployeeRole; employee: Employee }>("/login", { text: "admin" });
          resolved = data.employee;
        }
        setSession({ role: "admin", employeeId: resolved.id, tier, viaHost: true });
        setHostAuth({ status: "signed-in", tier });
      } catch (err) {
        console.error("[dashboard] host auto-login failed", err);
        setHostAuth({ status: "not-provisioned" });
      }
    })();
  }, [hostSession.token]);

  useEffect(() => {
    if (!hostSession.token) return;
    console.info("[dashboard] token:", hostSession.token);
  }, [hostSession.token]);

  if (!isEmbedded) {
    return <ManualApp />;
  }

  if (hostAuth.status === "resolving") {
    return <div style={{ padding: 16, color: "#9ca3af", fontSize: 13 }}>Waiting for session…</div>;
  }

  if (hostAuth.status === "not-provisioned") {
    return (
      <div style={{ padding: 16, color: "#9ca3af", fontSize: 13 }}>
        This account isn't set up in the HR tool yet — contact HR.
      </div>
    );
  }

  return <DashboardForTier tier={hostAuth.tier} />;
}
