import { useEffect, useState } from "react";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { currentMonth, formatTime, todayISODate } from "../date";
import type { Attendance } from "../types";

export function ClockCard({ onChange }: { onChange?: () => void }) {
  const [today, setToday] = useState<Attendance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const rows = await api.get<Attendance[]>(`/attendance/me?month=${currentMonth()}`);
    setToday(rows.find((r) => r.work_date === todayISODate()) ?? null);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, []);

  async function clockIn() {
    setLoading(true);
    setError(null);
    try {
      const row = await api.post<Attendance>("/attendance/clock-in");
      setToday(row);
      onChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clock in");
    } finally {
      setLoading(false);
    }
  }

  async function clockOut() {
    setLoading(true);
    setError(null);
    try {
      const row = await api.post<Attendance>("/attendance/clock-out");
      setToday(row);
      onChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clock out");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card title="Today">
      <p className="muted">{todayISODate()}</p>
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="field">
          <label>Clock in</label>
          <p>{formatTime(today?.clock_in ?? null)}</p>
        </div>
        <div className="field">
          <label>Clock out</label>
          <p>{formatTime(today?.clock_out ?? null)}</p>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="primary" onClick={clockIn} disabled={loading || !!today?.clock_in}>
          Clock In
        </Button>
        <Button onClick={clockOut} disabled={loading || !today?.clock_in || !!today?.clock_out}>
          Clock Out
        </Button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </Card>
  );
}
