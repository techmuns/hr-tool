import { useEffect, useState } from "react";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import { Tag } from "../components/ui/Tag";
import { currentMonth, formatDate, formatTime } from "../date";
import type { Attendance, LeaveRequest } from "../types";

function leaveTypeFor(day: string, leaves: LeaveRequest[]): string | null {
  const match = leaves.find(
    (l) => l.status === "approved" && day >= l.start_date && day <= l.end_date
  );
  return match ? match.leave_type : null;
}

export function WorkingDays() {
  const [month, setMonth] = useState(currentMonth());
  const [rows, setRows] = useState<Attendance[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.get<Attendance[]>(`/attendance/me?month=${month}`), api.get<LeaveRequest[]>("/leave/me")])
      .then(([attendance, leaveRows]) => {
        setRows(attendance);
        setLeaves(leaveRows);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [month]);

  return (
    <Card
      title="Working Days"
      actions={
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          style={{ width: "auto" }}
        />
      }
    >
      {error && <p className="error-text">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Clock In</th>
            <th>Clock Out</th>
            <th>Status</th>
            <th>Leave</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const leaveType = row.status === "leave" ? leaveTypeFor(row.work_date, leaves) : null;
            return (
              <tr key={row.id}>
                <td>{formatDate(row.work_date)}</td>
                <td>{formatTime(row.clock_in)}</td>
                <td>{formatTime(row.clock_out)}</td>
                <td>
                  <Tag value={row.status} />
                </td>
                <td>{leaveType ? <Tag value={leaveType} /> : <span className="muted">—</span>}</td>
              </tr>
            );
          })}
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
