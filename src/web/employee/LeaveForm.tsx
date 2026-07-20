import { useEffect, useState } from "react";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Tag } from "../components/ui/Tag";
import { formatDate } from "../date";
import type { LeaveRequest, LeaveType } from "../types";

interface MarkLeaveResponse {
  leave: LeaveRequest;
  dates: string[];
}

export function LeaveForm({ onMarked }: { onMarked?: () => void }) {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [days, setDays] = useState("1");
  const [leaveType, setLeaveType] = useState<LeaveType>("paid");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  function load() {
    api.get<LeaveRequest[]>("/leave/me").then(setRequests).catch(() => {});
  }

  useEffect(load, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Math.trunc(Number(days));
    if (!Number.isFinite(n) || n < 1) {
      setError("Enter a number of days of 1 or more");
      return;
    }
    setSubmitting(true);
    setError(null);
    setConfirmation(null);
    try {
      const res = await api.post<MarkLeaveResponse>("/leave", { days: n, leave_type: leaveType, reason });
      const first = formatDate(res.dates[0]);
      const last = formatDate(res.dates[res.dates.length - 1]);
      setConfirmation(
        res.dates.length === 1 ? `Marked ${first} as leave.` : `Marked ${first} – ${last} (${res.dates.length} days) as leave.`
      );
      setReason("");
      load();
      onMarked?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark leave");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card title="Mark Leave">
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Marks the next N business days, starting today, as leave — weekends are skipped automatically.
      </p>
      <form onSubmit={submit}>
        <div className="row">
          <div className="field">
            <label>Number of days</label>
            <input
              type="number"
              min={1}
              max={60}
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
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
          {submitting ? "Marking…" : "Mark Leave"}
        </Button>
        {confirmation && <span className="muted" style={{ marginLeft: 10 }}>{confirmation}</span>}
        {error && <p className="error-text">{error}</p>}
      </form>

      <h2 style={{ marginTop: 20 }}>My Leave</h2>
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
                No leave marked yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}
