import { useEffect, useState } from "react";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import { Tag } from "../components/ui/Tag";
import { currentMonth, formatDate, formatTime } from "../date";
import type { AttendanceWithName } from "../types";

export function AttendanceTable() {
  const [month, setMonth] = useState(currentMonth());
  const [rows, setRows] = useState<AttendanceWithName[]>([]);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .get<AttendanceWithName[]>(`/admin/attendance?month=${month}`)
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }

  useEffect(load, [month]);

  return (
    <Card
      title="Attendance"
      actions={<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: "auto" }} />}
    >
      {error && <p className="error-text">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th>Date</th>
            <th>Clock In</th>
            <th>Clock Out</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.employee_name}</td>
              <td>{formatDate(row.work_date)}</td>
              <td>{formatTime(row.clock_in)}</td>
              <td>{formatTime(row.clock_out)}</td>
              <td>
                <Tag value={row.status} />
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No attendance recorded for this month.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}
