import { useEffect, useState } from "react";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { formatDate } from "../date";
import { formatINR } from "../money";
import type { Reimbursement } from "../types";

export function ReimbursementRequest() {
  const [requests, setRequests] = useState<Reimbursement[]>([]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  function load() {
    api.get<Reimbursement[]>("/reimbursements/me").then(setRequests).catch(() => {});
  }

  useEffect(load, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const rupees = parseFloat(amount);
    if (!rupees || rupees <= 0) {
      setError("Enter an amount greater than 0");
      return;
    }
    setSubmitting(true);
    setError(null);
    setConfirmation(null);
    try {
      await api.post("/reimbursements", { amount: Math.round(rupees * 100), note: note.trim() });
      setAmount("");
      setNote("");
      setConfirmation("Request submitted.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card title="Request Reimbursement">
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Submit an expense for HR to review — travel, meals, equipment, etc.
      </p>
      <form onSubmit={submit}>
        <div className="row">
          <div className="field">
            <label>Amount (INR)</label>
            <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="field">
            <label>Note</label>
            <input
              type="text"
              placeholder="Travel, meals, etc."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit Request"}
        </Button>
        {confirmation && <span className="muted" style={{ marginLeft: 10 }}>{confirmation}</span>}
        {error && <p className="error-text">{error}</p>}
      </form>

      <h2 style={{ marginTop: 20 }}>My Reimbursements</h2>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Note</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id}>
              <td>{formatDate(r.created_at)}</td>
              <td>{r.note || <span className="muted">—</span>}</td>
              <td>{formatINR(r.amount)}</td>
            </tr>
          ))}
          {requests.length === 0 && (
            <tr>
              <td colSpan={3} className="muted">
                No reimbursement requests yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}
