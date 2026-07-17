import { useEffect, useState } from "react";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Tag } from "../components/ui/Tag";
import { formatDate } from "../date";
import type { LeaveRequestWithName } from "../types";

export function LeaveRequests() {
  const [rows, setRows] = useState<LeaveRequestWithName[]>([]);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .get<LeaveRequestWithName[]>("/admin/leave")
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }

  useEffect(load, []);

  async function setStatus(id: number, status: "approved" | "rejected") {
    setSavingId(id);
    setError(null);
    try {
      await api.patch(`/leave/${id}`, { status });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Card title="Leave Requests">
      {error && <p className="error-text">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th>Dates</th>
            <th>Type</th>
            <th>Reason</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.employee_name}</td>
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
              <td style={{ display: "flex", gap: 8 }}>
                <Button disabled={savingId === r.id || r.status === "approved"} onClick={() => setStatus(r.id, "approved")}>
                  Approve
                </Button>
                <Button
                  variant="danger"
                  disabled={savingId === r.id || r.status === "rejected"}
                  onClick={() => setStatus(r.id, "rejected")}
                >
                  Reject
                </Button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No leave requests.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}
