import { useEffect, useState } from "react";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { BILLS_ENABLED, BillLink, BillPicker } from "../components/Bill";
import { formatDate } from "../date";
import { formatINR } from "../money";
import type { Reimbursement } from "../types";

export function ReimbursementRequest() {
  const [requests, setRequests] = useState<Reimbursement[]>([]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [bill, setBill] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [pickerKey, setPickerKey] = useState(0);

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
      // Multipart rather than JSON so the bill can ride along with the fields.
      const form = new FormData();
      form.set("amount", String(Math.round(rupees * 100)));
      form.set("note", note.trim());
      if (bill) form.set("bill", bill);
      await api.post("/reimbursements", form);
      setAmount("");
      setNote("");
      setBill(null);
      setPickerKey((k) => k + 1); // remount BillPicker so the file input clears
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
        {BILLS_ENABLED && (
          <BillPicker key={pickerKey} file={bill} onPick={setBill} disabled={submitting} />
        )}
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
            {BILLS_ENABLED && <th>Bill</th>}
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id}>
              <td>{formatDate(r.created_at)}</td>
              <td>{r.note || <span className="muted">—</span>}</td>
              <td>{formatINR(r.amount)}</td>
              {BILLS_ENABLED && (
                <td>
                  <BillLink reimbursement={r} />
                </td>
              )}
            </tr>
          ))}
          {requests.length === 0 && (
            <tr>
              <td colSpan={BILLS_ENABLED ? 4 : 3} className="muted">
                No reimbursement requests yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}
