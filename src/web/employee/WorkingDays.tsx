import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import { currentMonth, dayKey, daysForMonth, formatTime, isToday, recentMonths } from "../date";
import { scrollToToday } from "../scrollToToday";
import type { Attendance, AttendanceStatus } from "../types";

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Not clocked in",
  leave: "Leave",
};

export function WorkingDays({ refreshSignal = 0 }: { refreshSignal?: number }) {
  const [month, setMonth] = useState(currentMonth());
  const [rows, setRows] = useState<Attendance[]>([]);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const months = useMemo(() => recentMonths(12), []);
  const days = useMemo(() => daysForMonth(month), [month]);

  useEffect(() => {
    api
      .get<Attendance[]>(`/attendance/me?month=${month}`)
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [month, refreshSignal]);

  const byDate = useMemo(() => {
    const map = new Map<string, Attendance>();
    for (const row of rows) map.set(row.work_date, row);
    return map;
  }, [rows]);

  useEffect(() => {
    scrollToToday(scrollRef.current);
  }, [days, rows]);

  return (
    <Card
      title="Working Days"
      actions={
        <select value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: "auto" }}>
          {months.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      }
    >
      {error && <p className="error-text">{error}</p>}
      <div className="heatmap-scroll" ref={scrollRef}>
        <table className="heatmap-grid">
          <thead>
            <tr>
              {days.map((day) => (
                <th key={day} className={isToday(month, day) ? "today-col" : undefined}>
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {days.map((day) => {
                const row = byDate.get(dayKey(month, day));
                const cls = row?.status ?? "empty";
                const title = row
                  ? `${dayKey(month, day)}: ${STATUS_LABEL[row.status]}`
                  : `${dayKey(month, day)}: no record`;
                return (
                  <td key={day}>
                    <div className={`hm-cell ${cls}`} title={title}>
                      {row ? (
                        <>
                          <span className="hm-status-label">{STATUS_LABEL[row.status]}</span>
                          {row.status === "present" ? (
                            <span className="hm-times">
                              <span>
                                <b>in</b>
                                {formatTime(row.clock_in)}
                              </span>
                              <span>
                                <b>out</b>
                                {formatTime(row.clock_out)}
                              </span>
                            </span>
                          ) : (
                            <span className="hm-times hm-noclock">no clock</span>
                          )}
                        </>
                      ) : null}
                    </div>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="hm-legend">
        <span className="hm-legend-item">
          <span className="hm-swatch present" /> Present
        </span>
        <span className="hm-legend-item">
          <span className="hm-swatch absent" /> Not clocked in
        </span>
        <span className="hm-legend-item">
          <span className="hm-swatch leave" /> Leave
        </span>
        <span className="hm-legend-item">
          <span className="hm-swatch empty" /> No record
        </span>
      </div>
    </Card>
  );
}
