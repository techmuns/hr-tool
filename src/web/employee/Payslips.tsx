import { useEffect, useState } from "react";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import { Tag } from "../components/ui/Tag";
import { formatDate } from "../date";
import { formatINR } from "../money";
import { exportPayslipPdf } from "../payslipPdf";
import { cycleLabel } from "../../worker/payslip";
import type { PayrollWithName } from "../types";

/**
 * An employee's own payroll history, with a PDF of each payslip — the thing
 * the payslip email itself now points people to ("download this as a PDF
 * anytime from the employee portal"). Read-only: nothing here can be edited,
 * only downloaded, so there's no busy/error-recovery machinery beyond the
 * initial load.
 */
export function Payslips() {
  const [rows, setRows] = useState<PayrollWithName[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<PayrollWithName[]>("/payroll/me")
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card title="Payslips">
      {error && <p className="error-text">{error}</p>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Cycle</th>
              <th>Net Pay</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{cycleLabel(row.period)}</td>
                <td>{formatINR(row.net_pay)}</td>
                <td>
                  {row.paid_at ? <Tag value="paid" /> : <Tag value="pending" />}
                  {row.paid_at && (
                    <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>
                      {formatDate(row.paid_at)}
                    </span>
                  )}
                </td>
                <td>
                  <button type="button" className="link-btn" onClick={() => exportPayslipPdf(row)}>
                    Download PDF
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  No payslips yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </Card>
  );
}
