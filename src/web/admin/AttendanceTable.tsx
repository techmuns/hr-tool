import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { currentMonth, dayKey, daysForMonth, formatTime, isToday, recentMonths } from "../date";
import { scrollToToday } from "../scrollToToday";
import type { AttendanceStatus, AttendanceWithName, Employee } from "../types";
import { EmployeePanel } from "./EmployeePanel";

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Not clocked in",
  leave: "Leave",
};

const STATUS_OPTIONS: AttendanceStatus[] = ["present", "absent", "leave"];

interface DayCell {
  status: AttendanceStatus;
  clock_in: string | null;
  clock_out: string | null;
}

interface Editing {
  employee: Employee;
  day: number;
  cell: DayCell | null;
  x: number;
  y: number;
}

export function AttendanceTable() {
  const [month, setMonth] = useState(currentMonth());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceWithName[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saving, setSaving] = useState(false);
  const [panelTarget, setPanelTarget] = useState<number | "new" | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const months = useMemo(() => recentMonths(12), []);
  const days = useMemo(() => daysForMonth(month), [month]);

  const load = useCallback(() => {
    return Promise.all([
      api.get<Employee[]>("/employees"),
      api.get<AttendanceWithName[]>(`/admin/attendance?month=${month}`),
    ])
      .then(([emps, att]) => {
        setEmployees(emps.filter((e) => e.role === "employee"));
        setAttendance(att);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

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

  // keep today's column in view whenever the grid changes
  useEffect(() => {
    scrollToToday(scrollRef.current);
  }, [days, employees]);

  function openEditor(e: React.MouseEvent, employee: Employee, day: number, cell: DayCell | null) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const MENU_W = 190;
    const MENU_H = 150;
    const x = Math.min(rect.left, window.innerWidth - MENU_W - 12);
    const y = rect.bottom + 4 + MENU_H > window.innerHeight ? rect.top - MENU_H - 4 : rect.bottom + 4;
    setEditing({ employee, day, cell, x: Math.max(12, x), y: Math.max(12, y) });
  }

  async function setStatus(status: AttendanceStatus) {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      await api.post("/admin/attendance", {
        employee_id: editing.employee.id,
        work_date: dayKey(month, editing.day),
        status,
        // preserve any recorded clock times through a status change
        clock_in: editing.cell?.clock_in ?? null,
        clock_out: editing.cell?.clock_out ?? null,
      });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      title="Attendance"
      actions={
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: "auto" }}>
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <Button variant="primary" onClick={() => setPanelTarget("new")}>
            + Add employee
          </Button>
        </div>
      }
    >
      {error && <p className="error-text">{error}</p>}
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Click a name to view or edit that employee. Click any cell to mark them present, not clocked in, or on leave.
      </p>

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
                  <td className="hm-name">
                    <button type="button" className="hm-name-btn" onClick={() => setPanelTarget(emp.id)}>
                      {emp.name}
                    </button>
                  </td>
                  {days.map((day) => {
                    const cell = dayMap?.get(dayKey(month, day)) ?? null;
                    const cls = cell?.status ?? "empty";
                    const title = cell
                      ? `${emp.name} — ${dayKey(month, day)}: ${STATUS_LABEL[cell.status]} (click to change)`
                      : `${emp.name} — ${dayKey(month, day)}: no record (click to set)`;
                    return (
                      <td key={day}>
                        <button
                          type="button"
                          className={`hm-cell ${cls}`}
                          title={title}
                          onClick={(e) => openEditor(e, emp, day, cell)}
                        >
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
                          ) : (
                            <span className="hm-add">+</span>
                          )}
                        </button>
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
          <span className="hm-swatch absent" /> Not clocked in
        </span>
        <span className="hm-legend-item">
          <span className="hm-swatch leave" /> Leave
        </span>
        <span className="hm-legend-item">
          <span className="hm-swatch empty" /> No record
        </span>
      </div>

      {editing && (
        <>
          <div className="hm-backdrop" onClick={() => setEditing(null)} />
          <div className="hm-menu" style={{ left: editing.x, top: editing.y }} role="menu">
            <div className="hm-menu-head">
              {editing.employee.name} · {dayKey(month, editing.day)}
            </div>
            {STATUS_OPTIONS.map((status) => (
              <button
                key={status}
                type="button"
                className={`hm-menu-item ${editing.cell?.status === status ? "current" : ""}`}
                disabled={saving}
                onClick={() => setStatus(status)}
              >
                <span className={`hm-swatch ${status}`} />
                {STATUS_LABEL[status]}
                {editing.cell?.status === status && <span className="hm-menu-check">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}

      {panelTarget !== null && (
        <EmployeePanel target={panelTarget} onClose={() => setPanelTarget(null)} onChanged={load} />
      )}
    </Card>
  );
}
