import { useState } from "react";
import { api } from "../api";
import { setSession } from "../session";
import type { Employee, EmployeeRole } from "../types";
import { Button } from "./ui/Button";
import { ThemeToggle } from "./ThemeToggle";

export function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await api.post<{ role: EmployeeRole; employee: Employee }>("/login", { text });
      setSession({ role: data.role, employeeId: data.employee.id });
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
        <h1>HR Tool</h1>
        <p className="muted">Type "admin" or "employee" to continue.</p>
        <form onSubmit={submit}>
          <div className="field">
            <input
              type="text"
              autoFocus
              placeholder="admin or employee"
              value={text}
              onChange={(e) => setText(e.target.value)}
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
