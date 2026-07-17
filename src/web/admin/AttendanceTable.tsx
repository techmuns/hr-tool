import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import { currentMonth, dayKey, daysForMonth, formatTime, isToday, recentMonths } from "../date";
import type { AttendanceStatus, AttendanceWithName, Employee } from "../types";

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  leave: "Leave",
};

interface DayCell {
  status: AttendanceStatus;
  clock_in: string | null;
  clock_out: string | null;
}

export function AttendanceTable() {
  const [month, setMonth] = useState(currentMonth());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceWithName[]>([]);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const months = useMemo(() => recentMonths(12), []);
  const days = useMemo(() => daysForMonth(month), [month]);

  useEffect(() => {
    Promise.all([
      api.get<Employee[]>("/employees"),
      api.get<AttendanceWithName[]>(`/admin/attendance?month=${month}`),
    ])
      .then(([emps, att]) => {
        setEmployees(emps.filter((e) => e.role === "employee"));
        setAttendance(att);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [month]);

  // employee_id -> "YYYY-MM-DD" -> cell
  const byEmployee = useMemo(() => {
    const map = new Map<number, Map<string, DayCell>>();
    for (const row of attendance) {
      if (!map.has(row.employee_id)) map.set(row.employee_id, new Map());
      map.get(row.employee_id)!.set(row.work_date, {
        status: row.status,
        clock_in: row.clock_in,
        clock_out: row.clock_out,
      });
    }
    return map;
  }, [attendance]);

  // keep the latest day (right edge) in view whenever the grid changes
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [days, employees]);

  return (
    <Card
      title="Attendance"
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
              <th className="hm-name">Employee</th>
              {days.map((day) => (
                <th key={day} className={isToday(month, day) ? "today-col" : undefined}>
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => {
              const dayMap = byEmployee.get(emp.id);
              return (
                <tr key={emp.id} className="hm-row-band">
                  <td className="hm-name">{emp.name}</td>
                  {days.map((day) => {
                    const cell = dayMap?.get(dayKey(month, day));
                    const cls = cell?.status ?? "empty";
                    const title = cell
                      ? `${emp.name} — ${dayKey(month, day)}: ${STATUS_LABEL[cell.status]}`
                      : `${emp.name} — ${dayKey(month, day)}: no record`;
                    return (
                      <td key={day}>
                        <div className={`hm-cell ${cls}`} title={title}>
                          {cell ? (
                            <>
                              <span className="hm-status-label">{STATUS_LABEL[cell.status]}</span>
                              {cell.status === "present" ? (
                                <span className="hm-times">
                                  <span>
                                    <b>in</b>
                                    {formatTime(cell.clock_in)}
                                  </span>
                                  <span>
                                    <b>out</b>
                                    {formatTime(cell.clock_out)}
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
              );
            })}
            {employees.length === 0 && (
              <tr>
                <td className="hm-name muted">No employees.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="hm-legend">
        <span className="hm-legend-item">
          <span className="hm-swatch present" /> Present
        </span>
        <span className="hm-legend-item">
          <span className="hm-swatch absent" /> Absent
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
