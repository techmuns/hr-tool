import { useState } from "react";
import { api } from "../api";
import { confirmDialog } from "../confirm";
import { formatDate } from "../date";
import type { Holiday } from "../types";

/**
 * National/festival holidays HR marks by hand. Shown here as a plain add
 * form + list; the attendance grid (AttendanceTable/WorkingDays) reads the
 * same list to mark those date columns instead of a "not clocked in" default,
 * and the clock-in reminder job skips them (see attendanceReminders.ts).
 */
export function HolidaysSection({ holidays, onChanged }: { holidays: Holiday[]; onChanged: () => void }) {
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [removingDate, setRemovingDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sorted = [...holidays].sort((a, b) => a.work_date.localeCompare(b.work_date));

  async function addHoliday(e: React.FormEvent) {
    e.preventDefault();
    if (!date || !name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.post("/admin/holidays", { work_date: date, name: name.trim() });
      setDate("");
      setName("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add holiday");
    } finally {
      setSaving(false);
    }
  }

  async function removeHoliday(workDate: string, holidayName: string) {
    const ok = await confirmDialog(`Remove "${holidayName}" (${formatDate(workDate)}) from the holiday list?`, {
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    setRemovingDate(workDate);
    setError(null);
    try {
      await api.del(`/admin/holidays/${workDate}`);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove holiday");
    } finally {
      setRemovingDate(null);
    }
  }

  return (
    <div style={{ marginTop: 24 }}>
      <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Holidays</h3>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        National/festival holidays. Marked here — or with the "Holiday" option on any cell in the grid
        above — they show on the attendance grid for everyone and nobody is emailed a clock-in reminder
        for them. Remove or rename one from this list.
      </p>
      {error && <p className="error-text">{error}</p>}
      <form onSubmit={addHoliday} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          style={{ width: "auto" }}
          aria-label="Holiday date"
        />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Diwali"
          required
          style={{ flex: 1, maxWidth: 240 }}
          aria-label="Holiday name"
        />
        <button type="submit" className="btn" disabled={saving}>
          {saving ? "Adding…" : "Add holiday"}
        </button>
      </form>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Name</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((h) => (
            <tr key={h.work_date}>
              <td>{formatDate(h.work_date)}</td>
              <td>{h.name}</td>
              <td>
                <button
                  type="button"
                  className="link-btn"
                  disabled={removingDate === h.work_date}
                  onClick={() => removeHoliday(h.work_date, h.name)}
                >
                  {removingDate === h.work_date ? "Removing…" : "Remove"}
                </button>
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={3} className="muted">
                No holidays marked yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
