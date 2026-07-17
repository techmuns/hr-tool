import { useEffect, useState } from "react";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import { formatDateTime } from "../date";
import type { FeedbackWithName } from "../types";

export function FeedbackList() {
  const [rows, setRows] = useState<FeedbackWithName[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<FeedbackWithName[]>("/admin/feedback")
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, []);

  return (
    <Card title="Feedback">
      {error && <p className="error-text">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th>Message</th>
            <th>Sent</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.employee_name}</td>
              <td>{r.message}</td>
              <td className="muted">{formatDateTime(r.created_at)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} className="muted">
                No feedback submitted yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}
