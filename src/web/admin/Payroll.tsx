import { useEffect, useState } from "react";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { currentMonth } from "../date";
import { formatINR } from "../money";
import { exportPayrollPdf } from "../pdf";
import type { PayrollWithName } from "../types";

export function Payroll() {
  const [period, setPeriod] = useState(currentMonth());
  const [rows, setRows] = useState<PayrollWithName[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load(generate = false) {
    setLoading(true);
    setError(null);
    api
      .get<PayrollWithName[]>(`/admin/payroll?period=${period}${generate ? "&generate=1" : ""}`)
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }

  useEffect(() => load(), [period]);

  return (
    <Card
      title="Payroll"
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ width: "auto" }} />
          <Button variant="primary" disabled={loading} onClick={() => load(true)}>
            Generate
          </Button>
          <Button disabled={rows.length === 0} onClick={() => exportPayrollPdf(period, rows)}>
            Export PDF
          </Button>
        </div>
      }
    >
      {error && <p className="error-text">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th>Base Salary</th>
            <th>Reimbursements</th>
            <th>Paid Days</th>
            <th>Unpaid Days</th>
            <th>Deductions</th>
            <th>Net Pay</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.employee_name}</td>
              <td>{formatINR(row.base_salary)}</td>
              <td>{formatINR(row.reimbursements)}</td>
              <td>{row.paid_days}</td>
              <td>{row.unpaid_days}</td>
              <td>{formatINR(row.deductions)}</td>
              <td>{formatINR(row.net_pay)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">
                No payroll for this period yet. Click Generate.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}
