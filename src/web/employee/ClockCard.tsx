import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import { currentMonth, formatDayLabel, formatTime, istClockParts, todayISODate } from "../date";
import type { Attendance } from "../types";

/** Live "now", refreshed every second so the clock actually ticks. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** ms → "H:MM:SS" for a running session. */
function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${pad(m)}:${pad(s)}`;
}

/** Point on the clock circle for a hand of the given length + angle (deg). */
function hand(angleDeg: number, length: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: 84 + length * Math.cos(rad), y: 84 + length * Math.sin(rad) };
}

function AnalogClock({ parts }: { parts: { hours: number; minutes: number; seconds: number } }) {
  const s = parts.seconds;
  const m = parts.minutes;
  const h = parts.hours % 12;

  const secAngle = s * 6;
  const minAngle = m * 6 + s * 0.1;
  const hourAngle = h * 30 + m * 0.5;

  // progress ring = fraction of the current minute elapsed
  const R = 81;
  const circ = 2 * Math.PI * R;
  const frac = s / 60;

  const ticks = Array.from({ length: 12 }, (_, i) => {
    const a = hand(i * 30, 68);
    const b = hand(i * 30, 76);
    return <line key={i} className="clock-tick" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
  });

  const secPt = hand(secAngle, 62);
  const secTail = hand(secAngle + 180, 16);

  return (
    <svg className="clock-svg" viewBox="0 0 168 168" role="img" aria-label="Current time">
      <circle className="clock-track" cx="84" cy="84" r={R} />
      <circle
        className="clock-progress"
        cx="84"
        cy="84"
        r={R}
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - frac)}
      />
      <circle className="clock-dial" cx="84" cy="84" r="60" />
      {ticks}
      <line
        className="clock-hand hour"
        x1="84"
        y1="84"
        x2={hand(hourAngle, 34).x}
        y2={hand(hourAngle, 34).y}
      />
      <line
        className="clock-hand minute"
        x1="84"
        y1="84"
        x2={hand(minAngle, 48).x}
        y2={hand(minAngle, 48).y}
      />
      <line className="clock-hand second" x1={secTail.x} y1={secTail.y} x2={secPt.x} y2={secPt.y} />
      <circle className="clock-hub" cx="84" cy="84" r="4.5" />
      <circle className="clock-hub-ring" cx="84" cy="84" r="7" />
    </svg>
  );
}

type Status = "idle" | "working" | "done";

export function ClockCard({ onChange }: { onChange?: () => void }) {
  const [today, setToday] = useState<Attendance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = useNow();
  const actionRef = useRef<HTMLButtonElement>(null);

  async function load() {
    const rows = await api.get<Attendance[]>(`/attendance/me?month=${currentMonth()}`);
    setToday(rows.find((r) => r.work_date === todayISODate()) ?? null);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, []);

  const status: Status = !today?.clock_in ? "idle" : !today?.clock_out ? "working" : "done";

  async function toggle(e: React.MouseEvent<HTMLButtonElement>) {
    // ripple from the click point
    const btn = actionRef.current;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const ripple = document.createElement("span");
      ripple.className = "ripple";
      ripple.style.left = `${e.clientX - rect.left}px`;
      ripple.style.top = `${e.clientY - rect.top}px`;
      ripple.style.width = ripple.style.height = `${Math.max(rect.width, rect.height)}px`;
      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    }

    setLoading(true);
    setError(null);
    try {
      const path = status === "idle" ? "/attendance/clock-in" : "/attendance/clock-out";
      const row = await api.post<Attendance>(path);
      setToday(row);
      onChange?.();
    } catch (err) {
      const verb = status === "idle" ? "clock in" : "clock out";
      setError(err instanceof Error ? err.message : `Failed to ${verb}`);
    } finally {
      setLoading(false);
    }
  }

  // Running session duration (only meaningful while working).
  let elapsed = "";
  if (status === "working" && today?.clock_in) {
    elapsed = formatDuration(now.getTime() - new Date(today.clock_in).getTime());
  } else if (status === "done" && today?.clock_in && today?.clock_out) {
    elapsed = formatDuration(new Date(today.clock_out).getTime() - new Date(today.clock_in).getTime());
  }

  const statusLabel = status === "working" ? "Working" : status === "done" ? "Shift complete" : "Not clocked in";
  const actionLabel = status === "idle" ? "Clock In" : "Clock Out";
  const ist = istClockParts(now);
  const dateLabel = formatDayLabel(now);

  return (
    <Card title="Today">
      <div className={`clock-card ${status === "working" ? "is-working" : ""}`.trim()}>
        <div className="clock-face-wrap">
          <AnalogClock parts={ist} />
        </div>

        <div className="clock-body">
          <span className="clock-date">{dateLabel}</span>

          <div className="clock-digital">
            <span>
              {pad(ist.hours)}:{pad(ist.minutes)}
            </span>
            <span className="sec">{pad(ist.seconds)}</span>
          </div>

          <span className={`clock-status ${status}`}>
            <span className="dot" />
            {statusLabel}
          </span>

          {elapsed && (
            <span className="clock-elapsed">
              {status === "working" ? "Elapsed" : "Total"} <b>{elapsed}</b>
            </span>
          )}

          <div className="clock-stamps">
            <div className="clock-stamp">
              <span className="lbl">Clock in</span>
              <span className={`val ${today?.clock_in ? "" : "empty"}`}>{formatTime(today?.clock_in ?? null)}</span>
            </div>
            <div className="clock-stamp">
              <span className="lbl">Clock out</span>
              <span className={`val ${today?.clock_out ? "" : "empty"}`}>{formatTime(today?.clock_out ?? null)}</span>
            </div>
          </div>

          <button
            ref={actionRef}
            className={`clock-action ${status === "working" ? "stop" : ""}`.trim()}
            onClick={toggle}
            disabled={loading || status === "done"}
          >
            {loading ? (
              <span className="spinner" />
            ) : status === "done" ? (
              "Done for today"
            ) : (
              <>
                <span className="glyph" aria-hidden>
                  {status === "idle" ? "▶" : "■"}
                </span>
                {actionLabel}
              </>
            )}
          </button>

          {error && <p className="error-text">{error}</p>}
        </div>
      </div>
    </Card>
  );
}
