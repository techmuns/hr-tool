import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import {
  currentMonth,
  dayKey,
  daysForMonth,
  dayOfWeekLabel,
  formatDate,
  formatTime,
  isToday,
  isWeekend,
  recentMonths,
  todayISODate,
  WORKING_DAYS_PER_MONTH,
} from "../date";
import { scrollToToday } from "../scrollToToday";
import { confirmDialog, promptDialog } from "../confirm";
import type { AttendanceStatus, AttendanceWithName, Employee, Holiday } from "../types";
import { EmployeePanel } from "./EmployeePanel";
import { HolidaysSection } from "./Holidays";

type SortKey = "name" | "work_mode";

const SORT_LABEL: Record<SortKey, string> = {
  name: "Name",
  work_mode: "Work mode",
};

const WORK_MODE_LABEL: Record<string, string> = {
  "in-office": "In-office",
  wfh: "WFH / Online",
  hybrid: "Hybrid",
};

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Not clocked in",
  leave: "Leave",
};

/**
 * The options in the cell editor. "In office" is a present day flagged
 * in_office — HR converts a normal (remote) present day into an in-office one,
 * which the payroll tab then totals. The plain "Present" clears the flag.
 * "Not clocked in — WFH" is the one absent-status option: it keeps the cell
 * looking exactly like a plain "not clocked in" day (see cellLabel/markCls
 * below) but flags wfh=1, which the payroll WFH column then counts.
 */
interface CellOption {
  key: string;
  label: string;
  status: AttendanceStatus;
  in_office: boolean;
  wfh: boolean;
  half_day: boolean;
  /** Which swatch colour to show — reuses the status swatch classes, plus "half-day". */
  swatch: AttendanceStatus | "half-day";
}
// In-office, WFH and half-day are all MANUAL marks HR applies to a present
// day; a plain "Present" is none of them. They're mutually exclusive.
const CELL_OPTIONS: CellOption[] = [
  { key: "present", label: "Present", status: "present", in_office: false, wfh: false, half_day: false, swatch: "present" },
  { key: "in_office", label: "In office", status: "present", in_office: true, wfh: false, half_day: false, swatch: "present" },
  { key: "wfh", label: "Work from home", status: "present", in_office: false, wfh: true, half_day: false, swatch: "present" },
  { key: "half_day", label: "Half day", status: "present", in_office: false, wfh: false, half_day: true, swatch: "half-day" },
  { key: "absent", label: "Not clocked in", status: "absent", in_office: false, wfh: false, half_day: false, swatch: "absent" },
  { key: "absent_wfh", label: "Not clocked in — WFH", status: "absent", in_office: false, wfh: true, half_day: false, swatch: "absent" },
  { key: "leave", label: "Leave", status: "leave", in_office: false, wfh: false, half_day: false, swatch: "leave" },
];

/**
 * The label a cell shows. Deliberately does NOT distinguish absent+wfh from
 * plain absent — both read "Not clocked in"; only the second line (see the
 * render below) and the payroll WFH count differ. That's the whole point of
 * the HR-marked-WFH-while-absent option: it must look like every other
 * "not clocked in" cell.
 */
function cellLabel(cell: { status: AttendanceStatus; in_office: boolean; wfh: boolean; half_day: boolean }): string {
  if (cell.status === "present" && cell.in_office) return "In office";
  if (cell.status === "present" && cell.half_day) return "Half day";
  if (cell.status === "present" && cell.wfh) return "WFH";
  return STATUS_LABEL[cell.status];
}

/** True when a cell matches an editor option (present/absent split on their flags). */
function isCurrentOption(cell: DayCell | null, opt: CellOption): boolean {
  if (!cell) return false;
  if (opt.status !== cell.status) return false;
  if (opt.status === "present") {
    return (
      Boolean(cell.in_office) === opt.in_office &&
      Boolean(cell.wfh) === opt.wfh &&
      Boolean(cell.half_day) === opt.half_day
    );
  }
  if (opt.status === "absent") return Boolean(cell.wfh) === opt.wfh;
  return true; // leave
}

interface DayCell {
  status: AttendanceStatus;
  clock_in: string | null;
  clock_out: string | null;
  in_office: boolean;
  wfh: boolean;
  half_day: boolean;
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
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saving, setSaving] = useState(false);
  const [panelTarget, setPanelTarget] = useState<number | "new" | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [reminding, setReminding] = useState(false);
  // Which single employee's reminder is in flight (per-row "Send reminder"),
  // separate from the bulk `reminding` flag above.
  const [remindingId, setRemindingId] = useState<number | null>(null);
  const [remindStatus, setRemindStatus] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const months = useMemo(() => recentMonths(12), []);
  const days = useMemo(() => daysForMonth(month), [month]);

  const load = useCallback(() => {
    return Promise.all([
      api.get<Employee[]>("/employees"),
      api.get<AttendanceWithName[]>(`/admin/attendance?month=${month}`),
      api.get<Holiday[]>("/holidays"),
    ])
      .then(([emps, att, hols]) => {
        // Tracked for attendance: employees + HR (who clock in), but not
        // founders (they don't clock in), freelancers, or anyone HR removed.
        setEmployees(
          emps.filter((e) => e.tier !== "founder" && e.employment_type !== "freelancer" && e.on_attendance !== 0),
        );
        setAttendance(att);
        setHolidays(hols);
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
        in_office: Boolean(row.in_office),
        wfh: Boolean(row.wfh),
        half_day: Boolean(row.half_day),
      });
    }
    return map;
  }, [attendance]);

  // "YYYY-MM-DD" -> holiday, for the header + synthetic-cell lookups below.
  const holidayByDate = useMemo(() => new Map(holidays.map((h) => [h.work_date, h])), [holidays]);

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
      if (sortBy === "work_mode") {
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
    const MENU_H = 250;
    const x = Math.min(rect.left, window.innerWidth - MENU_W - 12);
    const y = rect.bottom + 4 + MENU_H > window.innerHeight ? rect.top - MENU_H - 4 : rect.bottom + 4;
    setEditing({ employee, day, cell, x: Math.max(12, x), y: Math.max(12, y) });
  }

  async function removeFromAttendance(employee: Employee) {
    const ok = await confirmDialog(
      `Remove ${employee.name} from the attendance list? Their records are kept; re-add them from their employee panel.`,
      { confirmLabel: "Remove", danger: true },
    );
    if (!ok) return;
    setRemovingId(employee.id);
    setError(null);
    try {
      await api.del(`/admin/attendance/employee/${employee.id}`);
      setEmployees((list) => list.filter((e) => e.id !== employee.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove from attendance");
    } finally {
      setRemovingId(null);
    }
  }

  async function sendReminders() {
    const ok = await confirmDialog(
      "Email a clock-in reminder to everyone who hasn't clocked in for the last 3 working days?",
      { confirmLabel: "Send reminders" },
    );
    if (!ok) return;
    setReminding(true);
    setError(null);
    setRemindStatus(null);
    try {
      const res = await api.post<{ sent: string[]; failed: { name: string; error: string }[] }>(
        "/admin/attendance/reminders",
      );
      const parts: string[] = [];
      parts.push(
        res.sent.length
          ? `Reminder sent to ${res.sent.length} ${res.sent.length === 1 ? "person" : "people"}.`
          : "No reminders needed — everyone's clocked in within the last 3 working days.",
      );
      if (res.failed.length) parts.push(`${res.failed.length} couldn't be emailed.`);
      setRemindStatus(parts.join(" "));
      await load(); // refresh the "last reminder" column
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reminders");
    } finally {
      setReminding(false);
    }
  }

  // Per-employee send, like the payslip per-row "Send". Ignores the 3-day
  // threshold on the server — HR chose this person.
  async function sendReminderTo(employee: Employee) {
    setRemindingId(employee.id);
    setError(null);
    setRemindStatus(null);
    try {
      const res = await api.post<{ sent: string[]; failed: { name: string; error: string }[] }>(
        "/admin/attendance/reminders",
        { employee_ids: [employee.id] },
      );
      if (res.failed.length) {
        setError(`${employee.name}: ${res.failed[0].error}`);
      } else {
        setRemindStatus(`Reminder sent to ${employee.name}.`);
      }
      await load(); // refresh the "last reminder" column
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reminder");
    } finally {
      setRemindingId(null);
    }
  }

  async function setCell(status: AttendanceStatus, inOffice: boolean, wfh: boolean, halfDay: boolean) {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      await api.post("/admin/attendance", {
        employee_id: editing.employee.id,
        work_date: dayKey(month, editing.day),
        status,
        in_office: inOffice,
        wfh,
        half_day: halfDay,
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

  /** Delete one person's record for one day, so the cell goes back to the
   * grid's default for that date — the holiday, if there is one, otherwise
   * "not clocked in" / no record. This is the undo for a mis-clicked cell. */
  async function clearCell() {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      await api.del(`/admin/attendance/day/${editing.employee.id}/${dayKey(month, editing.day)}`);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear the record");
    } finally {
      setSaving(false);
    }
  }

  /**
   * The "Holiday" option in the same cell menu. A holiday is a company-wide
   * date (the same list HR maintains by hand in the Holidays section below),
   * so marking one from a cell marks that whole day for everyone — HR is
   * asked for the name, and this person's record for the day is cleared so
   * the cell shows the holiday. Anyone else who did clock in that day keeps
   * their real status, exactly as before.
   *
   * When the date is ALREADY a holiday, this just clears the record standing
   * in the way — which is the whole point of the option: a cell someone
   * mis-clicked to "not clocked in" on a holiday must be fixable from here.
   */
  async function setHolidayForDay() {
    if (!editing) return;
    const dateStr = dayKey(month, editing.day);
    const existing = holidayByDate.get(dateStr);
    if (existing) {
      await clearCell();
      return;
    }
    const name = await promptDialog(
      `Mark ${formatDate(dateStr)} as a holiday for everyone?` +
        (editing.cell ? ` ${editing.employee.name}'s record for that day will be cleared.` : ""),
      { placeholder: "e.g. Diwali", defaultValue: "Holiday", confirmLabel: "Mark holiday" },
    );
    if (!name) return;
    setSaving(true);
    setError(null);
    try {
      await api.post("/admin/holidays", { work_date: dateStr, name });
      if (editing.cell) {
        await api.del(`/admin/attendance/day/${editing.employee.id}/${dateStr}`);
      }
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark holiday");
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
          <Button onClick={sendReminders} disabled={reminding} title="Email a clock-in reminder to anyone who hasn't clocked in for the last 3 working days">
            {reminding ? "Sending…" : "Send reminders"}
          </Button>
          <Button variant="primary" onClick={() => setPanelTarget("new")}>
            + Add employee
          </Button>
        </div>
      }
    >
      {error && <p className="error-text">{error}</p>}
      {remindStatus && (
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          {remindStatus}
        </p>
      )}
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Click a name to view or edit that employee. Click any cell to mark them present, not clocked in, on leave,
        or to mark that date a holiday for everyone. "Clear record" undoes a cell you set by mistake.
        The count under each name is present days out of {WORKING_DAYS_PER_MONTH} working days/month.
      </p>

      <div className="heatmap-scroll" ref={scrollRef}>
        <table className="heatmap-grid">
          <thead>
            <tr>
              <th className="hm-name">Employee</th>
              {days.map((day) => {
                const holiday = holidayByDate.get(dayKey(month, day));
                const cls = [
                  isToday(month, day) ? "today-col" : "",
                  isWeekend(month, day) ? "weekend-col" : "",
                  holiday ? "holiday-col" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <th key={day} className={cls || undefined} title={holiday ? holiday.name : undefined}>
                    <span className="hm-dow">{dayOfWeekLabel(month, day)}</span>
                    <span className="hm-daynum">{day}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedEmployees.map((emp) => {
              const dayMap = byEmployee.get(emp.id);
              const present = presentCount.get(emp.id) ?? 0;
              const groupCtx =
                sortBy === "work_mode" ? WORK_MODE_LABEL[emp.work_mode] ?? emp.work_mode : null;
              const subtitle = `${present} / ${WORKING_DAYS_PER_MONTH}${groupCtx ? ` · ${groupCtx}` : ""}`;
              return (
                <tr key={emp.id} className="hm-row-band">
                  <td className="hm-name">
                    <div className="hm-name-row">
                      <button type="button" className="hm-name-btn" onClick={() => setPanelTarget(emp.id)}>
                        {emp.name}
                      </button>
                      <button
                        type="button"
                        className="row-remove-btn"
                        title={`Remove ${emp.name} from the attendance list`}
                        disabled={removingId === emp.id}
                        onClick={() => removeFromAttendance(emp)}
                      >
                        ✕
                      </button>
                    </div>
                    <span className="hm-name-sub">{subtitle}</span>
                  </td>
                  {days.map((day) => {
                    const cell = dayMap?.get(dayKey(month, day)) ?? null;
                    const dateStr = dayKey(month, day);
                    const holiday = holidayByDate.get(dateStr);
                    const started = dateStr <= todayISODate();
                    const onOrAfterJoin = dateStr >= emp.date_of_joining;
                    // A holiday only overrides the empty/no-record look when
                    // nobody actually has a real row that day — someone who
                    // clocked in anyway still shows their real status.
                    const isHoliday = !cell && Boolean(holiday);
                    const isSyntheticAbsent = !cell && !holiday && started && onOrAfterJoin;
                    const cls = cell?.status ?? (isSyntheticAbsent ? "absent" : isHoliday ? "holiday" : "empty");
                    const markCls =
                      cell?.status === "present"
                        ? cell.in_office
                          ? " in-office"
                          : cell.half_day
                            ? " half-day"
                            : cell.wfh
                              ? " wfh"
                              : ""
                        : "";
                    const title = cell
                      ? `${emp.name} — ${dateStr}: ${cellLabel(cell)}${cell.status === "absent" && cell.wfh ? " (WFH, HR-marked)" : ""} (click to change)`
                      : isHoliday
                        ? `${emp.name} — ${dateStr}: Holiday — ${holiday!.name} (click to set)`
                        : isSyntheticAbsent
                          ? `${emp.name} — ${dateStr}: Not clocked in (click to set)`
                          : `${emp.name} — ${dateStr}: no record (click to set)`;
                    return (
                      <td key={day}>
                        <button
                          type="button"
                          className={`hm-cell ${cls}${markCls}`}
                          title={title}
                          onClick={(e) => openEditor(e, emp, day, cell)}
                        >
                          {cell ? (
                            <>
                              <span className="hm-status-label">{cellLabel(cell)}</span>
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
                                <span className="hm-times hm-noclock">
                                  {cell.status === "absent" && cell.wfh ? "wfh" : "no clock"}
                                </span>
                              )}
                            </>
                          ) : isSyntheticAbsent ? (
                            <>
                              <span className="hm-status-label">{STATUS_LABEL.absent}</span>
                              <span className="hm-times hm-noclock">no clock</span>
                            </>
                          ) : isHoliday ? (
                            <span className="hm-status-label hm-holiday-name">{holiday!.name}</span>
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
          <span className="hm-swatch half-day" /> Half day
        </span>
        <span className="hm-legend-item">
          <span className="hm-swatch absent" /> Not clocked in
        </span>
        <span className="hm-legend-item">
          <span className="hm-swatch leave" /> Leave
        </span>
        <span className="hm-legend-item">
          <span className="hm-swatch holiday" /> Holiday
        </span>
        <span className="hm-legend-item">
          <span className="hm-swatch empty" /> No record
        </span>
      </div>

      <HolidaysSection holidays={holidays} onChanged={load} />

      <div style={{ marginTop: 24 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Clock-in reminders</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          A reminder email is sent automatically on weekdays to anyone who hasn't clocked in for the
          last 3 working days. You can also send one to a specific person here, like a payslip.
        </p>
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Last reminder</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sortedEmployees.map((emp) => (
              <tr key={emp.id}>
                <td>{emp.name}</td>
                <td>
                  {emp.last_attendance_reminder_at ? (
                    <>
                      {formatDate(emp.last_attendance_reminder_at)}
                      <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>
                        {emp.last_attendance_reminder_kind === "manual" ? "sent by hand" : "automatic"}
                      </span>
                    </>
                  ) : (
                    <span className="muted">Never</span>
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    className="link-btn"
                    disabled={remindingId === emp.id || reminding || !emp.email}
                    title={emp.email || "No email address on file"}
                    onClick={() => sendReminderTo(emp)}
                  >
                    {remindingId === emp.id ? "Sending…" : "Send reminder"}
                  </button>
                </td>
              </tr>
            ))}
            {sortedEmployees.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  No employees.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <>
          <div className="hm-backdrop" onClick={() => setEditing(null)} />
          <div className="hm-menu" style={{ left: editing.x, top: editing.y }} role="menu">
            <div className="hm-menu-head">
              {editing.employee.name} · {dayKey(month, editing.day)}
            </div>
            {CELL_OPTIONS.map((opt) => {
              const current = isCurrentOption(editing.cell, opt);
              return (
                <button
                  key={opt.key}
                  type="button"
                  className={`hm-menu-item ${current ? "current" : ""}`}
                  disabled={saving}
                  onClick={() => setCell(opt.status, opt.in_office, opt.wfh, opt.half_day)}
                >
                  <span className={`hm-swatch ${opt.swatch}`} />
                  {opt.label}
                  {current && <span className="hm-menu-check">✓</span>}
                </button>
              );
            })}
            {(() => {
              // Holiday sits with the rest of the options, but it's a
              // company-wide date rather than one person's status — so it's
              // marked here and removed (or renamed) in the Holidays list.
              // On a day that's already a holiday it stays clickable whenever
              // this person has a record covering it: clicking clears that
              // record so the cell shows the holiday again.
              const holiday = holidayByDate.get(dayKey(month, editing.day));
              const showsHoliday = Boolean(holiday) && !editing.cell;
              return (
                <button
                  type="button"
                  className={`hm-menu-item ${showsHoliday ? "current" : ""}`}
                  disabled={saving || showsHoliday}
                  title={
                    holiday
                      ? showsHoliday
                        ? `Already showing the holiday — ${holiday.name}. Remove it in the Holidays list below.`
                        : `Clear this record so the day shows the holiday — ${holiday.name}`
                      : "Mark this date as a holiday for everyone"
                  }
                  onClick={setHolidayForDay}
                >
                  <span className="hm-swatch holiday" />
                  Holiday
                  {showsHoliday && <span className="hm-menu-check">✓</span>}
                </button>
              );
            })()}
            {editing.cell && (
              // Plain undo for any mis-clicked cell: drop the record and the
              // day falls back to whatever it would have shown on its own.
              <button
                type="button"
                className="hm-menu-item"
                disabled={saving}
                title="Delete this record — the day goes back to its default"
                onClick={clearCell}
              >
                <span className="hm-swatch empty" />
                Clear record
              </button>
            )}
          </div>
        </>
      )}

      {panelTarget !== null && (
        <EmployeePanel target={panelTarget} onClose={() => setPanelTarget(null)} onChanged={load} />
      )}
    </Card>
  );
}
