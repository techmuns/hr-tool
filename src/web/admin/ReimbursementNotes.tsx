import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { recentMonths, todayISODate } from "../date";
import { formatINR } from "../money";
import { cycleLabel, periodForDate } from "../../worker/payslip";
import { reimbursedForEntry, reimbursedTotal } from "../../worker/reimbursement";
import type { BreakupEntry, Employee, ReimbursementBreakup } from "../types";

interface EditRow {
  label: string;
  amount: string; // rupees, as typed
  full: boolean; // this line's rate: true = 100%, false = 50%
}

/** Paise for one edited line — the typed rupee amount, clamped and rounded. */
function rowPaise(r: EditRow): number {
  return Math.max(0, Math.round((parseFloat(r.amount) || 0) * 100));
}

/**
 * HR-only notepad for the daily reimbursement breakup. HR picks a cycle and a
 * person, writes labelled lines with amounts, and picks each line's rate —
 * 100% or 50% — individually; payroll then reimburses the sum of those per-line
 * rates and shows the breakup in the Payroll reimbursements dropdown. New lines
 * default to 50% (the standard rate); HR bumps the ones that should pay in full
 * to 100%. This whole form is HR-only, so the backend re-checks tier === 'hr'
 * on save regardless of what the client sends. Founders don't see this tab
 * (they can view the breakup on Payroll).
 */
export function ReimbursementNotes() {
  const [period, setPeriod] = useState(periodForDate(todayISODate()));
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [breakups, setBreakups] = useState<Record<number, ReimbursementBreakup>>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rows, setRows] = useState<EditRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const months = useMemo(() => recentMonths(12), []);

  const load = useCallback(() => {
    Promise.all([
      api.get<Employee[]>("/employees"),
      api.get<ReimbursementBreakup[]>(`/admin/reimbursement-breakup?period=${period}`, { force: true }),
    ])
      .then(([emps, bks]) => {
        setEmployees(emps.filter((e) => e.on_payroll !== 0));
        const map: Record<number, ReimbursementBreakup> = {};
        for (const b of bks) map[b.employee_id] = b;
        setBreakups(map);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  function selectEmployee(id: number) {
    setSelectedId(id);
    setStatus(null);
    setError(null);
    const existing = breakups[id];
    setRows(
      existing && existing.entries.length
        ? existing.entries.map((e) => ({ label: e.label, amount: (e.amount / 100).toFixed(2), full: e.full }))
        : [{ label: "", amount: "", full: false }],
    );
  }

  function updateRow(i: number, patch: Partial<EditRow>) {
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  }

  const totalPaise = rows.reduce((s, r) => s + rowPaise(r), 0);
  const reimbursedPaise = reimbursedTotal(rows.map((r) => ({ amount: rowPaise(r), full: r.full })));

  async function save() {
    if (selectedId == null) return;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const entries: BreakupEntry[] = rows
        .map((r) => ({ label: r.label.trim(), amount: rowPaise(r), full: r.full }))
        .filter((e) => e.label !== "" || e.amount > 0);
      const saved = await api.put<ReimbursementBreakup>("/admin/reimbursement-breakup", {
        employee_id: selectedId,
        period,
        entries,
      });
      setBreakups((m) => ({ ...m, [selectedId]: saved }));
      setStatus(
        `Saved — reimbursing ${formatINR(saved.reimbursed)} of ${formatINR(saved.total)} logged (per-line 100% / 50%).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const selected = employees.find((e) => e.id === selectedId) ?? null;

  return (
    <Card
      title="Reimbursement notes"
      actions={
        <select value={period} onChange={(e) => setPeriod(e.target.value)} style={{ width: "auto" }}>
          {months.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      }
    >
      {error && <p className="error-text">{error}</p>}
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Log the daily reimbursement breakup for the {cycleLabel(period)} cycle. Set each line to reimburse{" "}
        <b>50%</b> (the default) or <b>100%</b> — payroll reimburses the sum of those per-line rates and shows this
        breakup in the Payroll reimbursements dropdown.
      </p>

      <div className="row">
        <div className="field">
          <label>Employee</label>
          <select value={selectedId ?? ""} onChange={(e) => selectEmployee(Number(e.target.value))}>
            <option value="" disabled>
              Select an employee…
            </option>
            {employees.map((emp) => {
              const t = breakups[emp.id]?.total ?? 0;
              return (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                  {t > 0 ? ` — ${formatINR(t)} logged` : ""}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {selected && (
        <div style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Note / day</th>
                <th style={{ width: 150 }}>Amount (INR)</th>
                <th style={{ width: 110 }}>Reimburse</th>
                <th style={{ width: 130 }}>Payout</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>
                    <input
                      type="text"
                      placeholder="e.g. Mon — client travel"
                      value={r.label}
                      onChange={(e) => updateRow(i, { label: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      placeholder="0.00"
                      value={r.amount}
                      onChange={(e) => updateRow(i, { amount: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      value={r.full ? "100" : "50"}
                      onChange={(e) => updateRow(i, { full: e.target.value === "100" })}
                      title="How much of this line to reimburse"
                    >
                      <option value="50">50%</option>
                      <option value="100">100%</option>
                    </select>
                  </td>
                  <td style={{ textAlign: "right" }}>{formatINR(reimbursedForEntry(rowPaise(r), r.full))}</td>
                  <td>
                    <button
                      type="button"
                      className="row-remove-btn"
                      title="Remove line"
                      onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => setRows((rs) => [...rs, { label: "", amount: "", full: false }])}
                  >
                    + Add line
                  </button>
                </td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>{formatINR(totalPaise)}</td>
                <td></td>
                <td></td>
                <td></td>
              </tr>
              <tr>
                <td className="muted">Total reimbursed</td>
                <td></td>
                <td></td>
                <td className="muted" style={{ textAlign: "right", fontWeight: 700 }}>
                  {formatINR(reimbursedPaise)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>

          <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save breakup"}
            </Button>
            {status && <span className="muted">{status}</span>}
          </div>
        </div>
      )}
    </Card>
  );
}
