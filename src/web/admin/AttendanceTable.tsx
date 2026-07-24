import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import {
  currentMonth,
  dayKey,
  daysForMonth,
  formatTime,
  isToday,
  recentMonths,
  todayISODate,
  WORKING_DAYS_PER_MONTH,
} from "../date";
import { scrollToToday } from "../scrollToToday";
import type { AttendanceStatus, AttendanceWithName, Employee, EmployeeWithTeam } from "../types";
import { EmployeePanel } from "./EmployeePanel";

type SortKey = "name" | "team" | "work_mode";

const SORT_LABEL: Record<SortKey, string> = {
  name: "Name",
  team: "Team",
  work_mode: "Work mode",
};

const WORK_MODE_LABEL: Record<string, string> = {
  "in-office": "In-office",
  wfh: "WFH / Online",
};

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
  const [employees, setEmployees] = useState<EmployeeWithTeam[]>([]);
  const [attendance, setAttendance] = useState<AttendanceWithName[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saving, setSaving] = useState(false);
  const [panelTarget, setPanelTarget] = useState<number | "new" | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const months = useMemo(() => recentMonths(12), []);
  const days = useMemo(() => daysForMonth(month), [month]);

  const load = useCallback(() => {
    return Promise.all([
      api.get<EmployeeWithTeam[]>("/employees"),
      api.get<AttendanceWithName[]>(`/admin/attendance?month=${month}`),
    ])
      .then(([emps, att]) => {
        // Everyone tracked for attendance: employees + HR/founders, but not freelancers.
        setEmployees(emps.filter((e) => e.employment_type !== "freelancer"));
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

  // employee_id -> count of present days this month
  const presentCount = useMemo(() => {
    const map = new Map<number, number>();
    for (const row of attendance) {
      if (row.status === "present") map.set(row.employee_id, (map.get(row.employee_id) ?? 0) + 1);
    }
    return map;
  }, [attendance]);

  const sortedEmployees = useMemo(() => {
    const list = [...employees];
    list.sort((a, b) => {
      if (sortBy === "team") {
        const cmp = (a.team_name ?? "~").localeCompare(b.team_name ?? "~");
        if (cmp !== 0) return cmp;
      } else if (sortBy === "work_mode") {
        const cmp = a.work_mode.localeCompare(b.work_mode);
        if (cmp !== 0) return cmp;
      }
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [employees, sortBy]);

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
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)} style={{ width: "auto" }} title="Sort by">
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                Sort: {SORT_LABEL[k]}
              </option>
            ))}
          </select>
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
        The count under each name is present days out of {WORKING_DAYS_PER_MONTH} working days/month.
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
            {sortedEmployees.map((emp) => {
              const dayMap = byEmployee.get(emp.id);
              const present = presentCount.get(emp.id) ?? 0;
              const groupCtx =
                sortBy === "team"
                  ? emp.team_name ?? "No team"
                  : sortBy === "work_mode"
                    ? WORK_MODE_LABEL[emp.work_mode] ?? emp.work_mode
                    : null;
              const subtitle = `${present} / ${WORKING_DAYS_PER_MONTH}${groupCtx ? ` · ${groupCtx}` : ""}`;
              return (
                <tr key={emp.id} className="hm-row-band">
                  <td className="hm-name">
                    <button type="button" className="hm-name-btn" onClick={() => setPanelTarget(emp.id)}>
                      {emp.name}
                    </button>
                    <span className="hm-name-sub">{subtitle}</span>
                  </td>
                  {days.map((day) => {
                    const cell = dayMap?.get(dayKey(month, day)) ?? null;
                    const dateStr = dayKey(month, day);
                    const started = dateStr <= todayISODate();
                    const onOrAfterJoin = dateStr >= emp.date_of_joining;
                    const isSyntheticAbsent = !cell && started && onOrAfterJoin;
                    const cls = cell?.status ?? (isSyntheticAbsent ? "absent" : "empty");
                    const title = cell
                      ? `${emp.name} — ${dateStr}: ${STATUS_LABEL[cell.status]} (click to change)`
                      : isSyntheticAbsent
                        ? `${emp.name} — ${dateStr}: Not clocked in (click to set)`
                        : `${emp.name} — ${dateStr}: no record (click to set)`;
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
                          ) : isSyntheticAbsent ? (
                            <>
                              <span className="hm-status-label">{STATUS_LABEL.absent}</span>
                              <span className="hm-times hm-noclock">no clock</span>
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
