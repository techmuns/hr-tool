import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { currentMonth, formatDate } from "../date";
import { confirmDialog } from "../confirm";
import { formatINR } from "../money";
import { exportPayrollPdf } from "../pdf";
import { cycleLabel, payDueDate } from "../../worker/payslip";
import type { PayrollWithName } from "../types";

interface EmailResult {
  sent: string[];
  failed: { name: string; error: string }[];
  /** Anyone the API refused the formatted payslip for, who got plain text. */
  plainText?: string[];
}

export function Payroll() {
  const [period, setPeriod] = useState(currentMonth());
  const [rows, setRows] = useState<PayrollWithName[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [paidBusy, setPaidBusy] = useState(false);
  const [emailingIds, setEmailingIds] = useState<number[]>([]);
  const [result, setResult] = useState<EmailResult | null>(null);
  // Who gets a payslip on the next bulk send. Seeded from the loaded rows, then
  // owned by the user's checkbox clicks until the period changes.
  const [selected, setSelected] = useState<Set<number>>(new Set());

  function load(generate = false) {
    setLoading(true);
    setError(null);
    api
      .get<PayrollWithName[]>(`/admin/payroll?period=${period}${generate ? "&generate=1" : ""}`)
      .then((data) => {
        setRows(data);
        // Default to everyone we can actually reach; people with no address on
        // file start unchecked rather than failing later.
        setSelected(new Set(data.filter((r) => r.employee_email).map((r) => r.employee_id)));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    setResult(null);
    load();
  }, [period]);

  const paidCount = rows.filter((r) => r.paid_at).length;
  const allPaid = rows.length > 0 && paidCount === rows.length;
  const paidOn = rows.find((r) => r.paid_at)?.paid_at ?? null;
  const mailable = useMemo(() => rows.filter((r) => r.employee_email), [rows]);
  const selectedCount = rows.filter((r) => selected.has(r.employee_id)).length;

  function toggle(employeeId: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === mailable.length ? new Set() : new Set(mailable.map((r) => r.employee_id)),
    );
  }

  async function removeFromPayroll(employeeId: number, name: string) {
    const ok = await confirmDialog(
      `Remove ${name} from payroll? They'll be skipped in future runs until re-added from their employee panel.`,
      { confirmLabel: "Remove", danger: true },
    );
    if (!ok) return;
    setRemovingId(employeeId);
    setError(null);
    try {
      await api.del(`/admin/payroll/employee/${employeeId}`);
      setRows((rs) => rs.filter((r) => r.employee_id !== employeeId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove from payroll");
    } finally {
      setRemovingId(null);
    }
  }

  async function setPaid(paid: boolean) {
    if (paid) {
      const ok = await confirmDialog(
        `Mark the ${cycleLabel(period)} cycle as paid for all ${rows.length} people on this payroll?`,
        { confirmLabel: "Mark paid" },
      );
      if (!ok) return;
    }
    setPaidBusy(true);
    setError(null);
    try {
      await api.post("/admin/payroll/paid", { period, paid });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update payment status");
    } finally {
      setPaidBusy(false);
    }
  }

  async function emailPayslips(employeeIds: number[]) {
    if (employeeIds.length === 0) return;
    setEmailingIds(employeeIds);
    setError(null);
    setResult(null);
    try {
      const res = await api.post<EmailResult>("/admin/payroll/email", {
        period,
        employee_ids: employeeIds,
      });
      setResult(res);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send payslips");
    } finally {
      setEmailingIds([]);
    }
  }

  const busy = loading || paidBusy || emailingIds.length > 0;

  return (
    <Card
      title="Payroll"
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ width: "auto" }} />
          <Button variant="primary" disabled={busy} onClick={() => load(true)}>
            Generate
          </Button>
          <Button disabled={rows.length === 0} onClick={() => exportPayrollPdf(period, rows)}>
            Export PDF
          </Button>
        </div>
      }
    >
      {error && <p className="error-text">{error}</p>}

      {rows.length > 0 && (
        <div className="payroll-bar">
          <div>
            <strong>{allPaid ? "Dues paid" : "Dues outstanding"}</strong>
            <span className="muted">
              {/* The month picker says "August 2026", but the cycle it bills is
                  11 Aug – 10 Sep — spell that out so the two can't be confused. */}
              {` · cycle ${cycleLabel(period)}`}
              {allPaid && paidOn
                ? ` · marked paid ${formatDate(paidOn)}`
                : ` · due ${formatDate(payDueDate(period))}`}
              {!allPaid && paidCount > 0 && ` · ${paidCount} of ${rows.length} already marked`}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              disabled={busy || selectedCount === 0}
              onClick={() => emailPayslips(rows.filter((r) => selected.has(r.employee_id)).map((r) => r.employee_id))}
            >
              {emailingIds.length > 1 ? "Sending…" : `Email payslips (${selectedCount})`}
            </Button>
            <Button variant={allPaid ? undefined : "primary"} disabled={busy} onClick={() => setPaid(!allPaid)}>
              {allPaid ? "Mark unpaid" : "Mark dues paid"}
            </Button>
          </div>
        </div>
      )}

      {result && (
        <div className="payroll-result">
          {result.sent.length > 0 && (
            <p className="muted">
              Payslip sent to {result.sent.length} {result.sent.length === 1 ? "person" : "people"}:{" "}
              {result.sent.join(", ")}.
            </p>
          )}
          {result.plainText && result.plainText.length > 0 && (
            <p className="error-text">
              The mail API rejected the formatted payslip for {result.plainText.length}{" "}
              {result.plainText.length === 1 ? "person" : "people"} — they were sent the plain-text
              version instead ({result.plainText.join(", ")}).
            </p>
          )}
          {result.failed.map((f) => (
            <p key={f.name} className="error-text">
              {f.name}: {f.error}
            </p>
          ))}
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th style={{ width: 28 }}>
              <input
                type="checkbox"
                aria-label="Select everyone for payslip email"
                checked={mailable.length > 0 && selected.size === mailable.length}
                disabled={mailable.length === 0}
                onChange={toggleAll}
              />
            </th>
            <th>Employee</th>
            <th>Base Salary</th>
            <th>Reimbursements</th>
            <th>Paid Days</th>
            <th>Deductions</th>
            <th>Net Pay</th>
            <th>Payslip</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <input
                  type="checkbox"
                  aria-label={`Email payslip to ${row.employee_name}`}
                  checked={selected.has(row.employee_id)}
                  disabled={!row.employee_email}
                  title={row.employee_email ? row.employee_email : "No email address on file"}
                  onChange={() => toggle(row.employee_id)}
                />
              </td>
              <td>
                {row.employee_name}
                {row.paid_at && (
                  <span className="muted" title={`Paid ${formatDate(row.paid_at)}`}>
                    {" "}
                    ✓
                  </span>
                )}
              </td>
              <td>{formatINR(row.base_salary)}</td>
              <td>{formatINR(row.reimbursements)}</td>
              <td>{row.paid_days}</td>
              <td>{formatINR(row.deductions)}</td>
              <td>{formatINR(row.net_pay)}</td>
              <td>
                <button
                  type="button"
                  className="link-btn"
                  disabled={busy || !row.employee_email}
                  title={row.employee_email || "No email address on file"}
                  onClick={() => emailPayslips([row.employee_id])}
                >
                  {emailingIds.length === 1 && emailingIds[0] === row.employee_id ? "Sending…" : "Send"}
                </button>
                {row.payslip_emailed_at && (
                  <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>
                    sent {formatDate(row.payslip_emailed_at)}
                  </span>
                )}
              </td>
              <td>
                <button
                  type="button"
                  className="row-remove-btn"
                  title={`Remove ${row.employee_name} from payroll`}
                  disabled={removingId === row.employee_id}
                  onClick={() => removeFromPayroll(row.employee_id, row.employee_name)}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={9} className="muted">
                No payroll for this period yet. Click Generate.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}
