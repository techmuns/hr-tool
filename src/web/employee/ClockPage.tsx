import { ClockCard } from "./ClockCard";
import { ThemeToggle } from "../components/ThemeToggle";
import { Button } from "../components/ui/Button";

/**
 * Minimal standalone quick-clock page served at /clock. Assumes an existing
 * saved session (auto-login); App gates unauthenticated visitors to Login
 * first, then lands them back here.
 */
export function ClockPage({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="clock-page">
      <div className="clock-page-inner">
        <div className="clock-page-top">
          <span className="clock-page-title">Quick Clock</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ThemeToggle />
            <Button onClick={onLogout}>Log out</Button>
          </div>
        </div>
        <ClockCard />
        <a className="clock-page-link" href="/">Open full dashboard →</a>
      </div>
    </div>
  );
}
