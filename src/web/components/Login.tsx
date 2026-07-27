import { useState } from "react";
import { api } from "../api";
import { setSession } from "../session";
import { setAppToken } from "../authToken";
import type { Employee, EmployeeRole } from "../types";
import { Button } from "./ui/Button";
import { ThemeToggle } from "./ThemeToggle";

type Step = "email" | "code";

export function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      await api.post("/auth/request-otp", { email: email.trim() });
      setStep("code");
      setInfo("If that account exists, a verification code has been sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send code");
    } finally {
      setLoading(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await api.post<{ token: string; role: EmployeeRole; employee: Employee }>("/auth/verify-otp", {
        email: email.trim(),
        code: code.trim(),
      });
      setAppToken(data.token);
      setSession({ role: data.role, employeeId: data.employee.id, tier: data.employee.tier });
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
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

        {step === "email" ? (
          <>
            <p className="muted">Sign in with your work email — we'll send you a one-time code.</p>
            <form onSubmit={sendCode}>
              <div className="field">
                <input
                  type="email"
                  autoFocus
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" variant="primary" disabled={loading} style={{ width: "100%" }}>
                {loading ? "Sending…" : "Send code"}
              </Button>
              {error && <p className="error-text">{error}</p>}
            </form>
          </>
        ) : (
          <>
            <p className="muted">
              Enter the code sent to <strong>{email}</strong>.
            </p>
            <form onSubmit={verify}>
              <div className="field">
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  placeholder="6-digit code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              <Button type="submit" variant="primary" disabled={loading} style={{ width: "100%" }}>
                {loading ? "Verifying…" : "Verify & sign in"}
              </Button>
              <Button
                type="button"
                variant="default"
                disabled={loading}
                style={{ width: "100%", marginTop: 8 }}
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setError(null);
                  setInfo(null);
                }}
              >
                Use a different email
              </Button>
              {info && <p className="muted">{info}</p>}
              {error && <p className="error-text">{error}</p>}
            </form>
          </>
        )}
      </div>
    </div>
  );
}
