import { useState } from "react";
import { api } from "../api";
import { setSession } from "../session";
import type { Employee, EmployeeRole } from "../types";
import { Button } from "./ui/Button";
import { ThemeToggle } from "./ThemeToggle";

type Step = "email" | "code";

export function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      await api.post("/auth/request-otp", { email: value });
      setEmail(value);
      setStep("code");
      setNotice(`We emailed a 6-digit code to ${value}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send code");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    const value = code.trim();
    if (!value) {
      setError("Enter the code from your email.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const data = await api.post<{ role: EmployeeRole; employee: Employee }>("/auth/verify-otp", {
        email,
        code: value,
      });
      setSession({ role: data.role, employeeId: data.employee.id, tier: data.employee.tier });
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  function backToEmail() {
    setStep("email");
    setCode("");
    setError(null);
    setNotice(null);
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-top">
          <ThemeToggle />
        </div>
        <div className="login-badge" aria-hidden="true">HR</div>
        <h1>HR Tool</h1>
        <p className="login-sub">
          {step === "email"
            ? "Sign in to view your attendance, leave and payroll."
            : "Enter the verification code we just emailed you."}
        </p>

        {step === "email" ? (
          <form onSubmit={requestCode}>
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
              {loading ? "Sending code…" : "Send verification code"}
            </Button>
            {notice && <p className="login-sub" style={{ margin: "10px 0 0" }}>{notice}</p>}
            {error && <p className="error-text">{error}</p>}
          </form>
        ) : (
          <form onSubmit={verifyCode}>
            {notice && <p className="login-sub" style={{ marginTop: 0 }}>{notice}</p>}
            <div className="field">
              <label className="login-label" htmlFor="login-code">Verification code</label>
              <input
                id="login-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={6}
                placeholder="000000"
                className="otp-input"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <Button type="submit" variant="primary" disabled={loading} style={{ width: "100%" }}>
              {loading ? "Verifying…" : "Verify & continue"}
            </Button>
            <button type="button" className="login-linkbtn" onClick={backToEmail}>
              Use a different email
            </button>
            {error && <p className="error-text">{error}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
