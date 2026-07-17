import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import { currentMonth, dayKey, daysForMonth, isToday, recentMonths } from "../date";
import type { AttendanceStatus, AttendanceWithName, Employee } from "../types";

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  leave: "On leave",
};

const STATUS_MARK: Record<AttendanceStatus, string> = {
  present: "P",
  absent: "A",
  leave: "L",
};

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

  // status lookup: employee_id -> "YYYY-MM-DD" -> status
  const byEmployee = useMemo(() => {
    const map = new Map<number, Map<string, AttendanceStatus>>();
    for (const row of attendance) {
      if (!map.has(row.employee_id)) map.set(row.employee_id, new Map());
      map.get(row.employee_id)!.set(row.work_date, row.status);
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
                    const status = dayMap?.get(dayKey(month, day));
                    const cls = status ?? "empty";
                    const title = status
                      ? `${emp.name} — ${dayKey(month, day)}: ${STATUS_LABEL[status]}`
                      : `${emp.name} — ${dayKey(month, day)}: no record`;
                    return (
                      <td key={day}>
                        <div className={`hm-cell ${cls}`} title={title}>
                          {status ? STATUS_MARK[status] : ""}
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
          <span className="hm-swatch present">P</span> Present
        </span>
        <span className="hm-legend-item">
          <span className="hm-swatch absent">A</span> Absent
        </span>
        <span className="hm-legend-item">
          <span className="hm-swatch leave">L</span> On leave
        </span>
        <span className="hm-legend-item">
          <span className="hm-swatch empty" /> No record
        </span>
      </div>
    </Card>
  );
}
