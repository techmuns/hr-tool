import { useEffect, useState } from "react";
import { api } from "../api";
import { confirmDialog } from "../confirm";
import { Card } from "../components/ui/Card";
import { formatDateTime } from "../date";
import type { FeedbackWithName } from "../types";

export function FeedbackList() {
  const [rows, setRows] = useState<FeedbackWithName[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);

  useEffect(() => {
    api
      .get<FeedbackWithName[]>("/admin/feedback")
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, []);

  async function removeFeedback(id: number) {
    const ok = await confirmDialog("Delete this feedback? This can't be undone.", {
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setRemovingId(id);
    setError(null);
    try {
      await api.del(`/admin/feedback/${id}`);
      setRows((rs) => rs.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete feedback");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <Card title="Feedback">
      {error && <p className="error-text">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th>Message</th>
            <th>Sent</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.employee_name ?? <span className="muted">Anonymous</span>}</td>
              <td>{r.message}</td>
              <td className="muted">{formatDateTime(r.created_at)}</td>
              <td>
                <button
                  type="button"
                  className="row-remove-btn"
                  title="Delete feedback"
                  disabled={removingId === r.id}
                  onClick={() => removeFeedback(r.id)}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                No feedback submitted yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}
