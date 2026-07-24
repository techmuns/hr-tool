import { useState } from "react";
import { api } from "../api";
import { setSession } from "../session";
import type { Employee, EmployeeRole } from "../types";
import { Button } from "./ui/Button";
import { ThemeToggle } from "./ThemeToggle";

export function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const data = await api.post<{ role: EmployeeRole; employee: Employee }>("/login", { text: value });
      setSession({ role: data.role, employeeId: data.employee.id, tier: data.employee.tier });
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-top">
          <ThemeToggle />
        </div>
        <div className="login-badge" aria-hidden="true">HR</div>
        <h1>HR Tool</h1>
        <p className="login-sub">Sign in to view your attendance, leave and payroll.</p>
        <form onSubmit={submit}>
          <div className="field">
            <label className="login-label" htmlFor="login-email">HR login email</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" variant="primary" disabled={loading} style={{ width: "100%" }}>
            {loading ? "Signing in…" : "Continue"}
          </Button>
          {error && <p className="error-text">{error}</p>}
        </form>
      </div>
    </div>
  );
}
