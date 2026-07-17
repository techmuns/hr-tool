import { useEffect, useState } from "react";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Tag } from "../components/ui/Tag";
import { formatDate } from "../date";
import type { LeaveRequest, LeaveType } from "../types";

export function LeaveForm() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [leaveType, setLeaveType] = useState<LeaveType>("paid");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get<LeaveRequest[]>("/leave/me").then(setRequests).catch(() => {});
  }

  useEffect(load, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!startDate || !endDate) {
      setError("Start and end date are required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/leave", { start_date: startDate, end_date: endDate, leave_type: leaveType, reason });
      setStartDate("");
      setEndDate("");
      setReason("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card title="Apply for Leave">
      <form onSubmit={submit}>
        <div className="row">
          <div className="field">
            <label>Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="field">
            <label>End Date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="field">
            <label>Type</label>
            <select value={leaveType} onChange={(e) => setLeaveType(e.target.value as LeaveType)}>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label>Reason</label>
          <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit Request"}
        </Button>
        {error && <p className="error-text">{error}</p>}
      </form>

      <h2 style={{ marginTop: 20 }}>My Requests</h2>
      <table>
        <thead>
          <tr>
            <th>Dates</th>
            <th>Type</th>
            <th>Reason</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id}>
              <td>
                {formatDate(r.start_date)} – {formatDate(r.end_date)}
              </td>
              <td>
                <Tag value={r.leave_type} />
              </td>
              <td>{r.reason || <span className="muted">—</span>}</td>
              <td>
                <Tag value={r.status} />
              </td>
            </tr>
          ))}
          {requests.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                No leave requests yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}
