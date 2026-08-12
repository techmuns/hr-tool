import { useState } from "react";
import { adminLogin, setAdminPassword } from "../api";
import { Button } from "./ui/Button";
import { ThemeToggle } from "./ThemeToggle";

type Mode = "password" | "set-password";

/**
 * Gate shown to a role='admin' employee who has a valid base (OTP/host)
 * session but no live admin session yet. The base session already proved
 * they own this account's email — this step proves it's really them for HR
 * capability specifically, via a password only they know. See
 * src/worker/routes/auth.ts (/auth/admin-login) for the server side.
 */
export function AdminUnlock({ onUnlocked }: { onUnlocked: () => void }) {
  const [mode, setMode] = useState<Mode>("password");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await adminLogin(password);
      onUnlocked();
    } catch (err) {
      const code = (err as { code?: string } | undefined)?.code;
      if (code === "no_password") {
        setMode("set-password");
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : "Sign-in failed");
      }
    } finally {
      setLoading(false);
    }
  }

  async function submitNewPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      await setAdminPassword(newPassword);
      await adminLogin(newPassword);
      onUnlocked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set password");
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
        <h1>Admin access</h1>
        <p className="login-sub">
          {mode === "password"
            ? "This account has HR/founder access. Enter your admin password to continue."
            : "No admin password is set on this account yet. Choose one to continue."}
        </p>

        {mode === "password" ? (
          <form onSubmit={submitPassword}>
            <div className="field">
              <label className="login-label" htmlFor="admin-password">Admin password</label>
              <input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" variant="primary" disabled={loading || !password} style={{ width: "100%" }}>
              {loading ? "Verifying…" : "Unlock admin access"}
            </Button>
            <button
              type="button"
              className="login-linkbtn"
              onClick={() => {
                setError(null);
                setMode("set-password");
              }}
            >
              Set or reset admin password
            </button>
            {error && <p className="error-text">{error}</p>}
          </form>
        ) : (
          <form onSubmit={submitNewPassword}>
            {notice && <p className="login-sub" style={{ marginTop: 0 }}>{notice}</p>}
            <div className="field">
              <label className="login-label" htmlFor="admin-new-password">New admin password</label>
              <input
                id="admin-new-password"
                type="password"
                autoComplete="new-password"
                autoFocus
                minLength={12}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="login-label" htmlFor="admin-confirm-password">Confirm password</label>
              <input
                id="admin-confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <Button type="submit" variant="primary" disabled={loading} style={{ width: "100%" }}>
              {loading ? "Saving…" : "Set password & continue"}
            </Button>
            <button
              type="button"
              className="login-linkbtn"
              onClick={() => {
                setError(null);
                setNotice(null);
                setMode("password");
              }}
            >
              I already have a password
            </button>
            {error && <p className="error-text">{error}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
