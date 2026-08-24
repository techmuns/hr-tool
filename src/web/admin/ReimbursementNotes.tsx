import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { recentMonths, todayISODate } from "../date";
import { formatINR } from "../money";
import { cycleLabel, periodForDate } from "../../worker/payslip";
import type { BreakupEntry, Employee, ReimbursementBreakup } from "../types";

interface EditRow {
  label: string;
  amount: string; // rupees, as typed
}

/**
 * HR-only notepad for the daily reimbursement breakup. HR picks a cycle and a
 * person, writes labelled lines with amounts, and saves; payroll then reimburses
 * HALF the logged total by default and shows the breakup in the Payroll
 * reimbursements dropdown. The "100% instead of 50%" checkbox is an
 * admin-only override — it's part of this HR-only form, so only HR/founder
 * (role=admin) accounts can ever reach it; the backend re-checks tier === 'hr'
 * on save regardless of what the client sends. Founders don't see this tab
 * (they can view the breakup on Payroll).
 */
export function ReimbursementNotes() {
  const [period, setPeriod] = useState(periodForDate(todayISODate()));
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [breakups, setBreakups] = useState<Record<number, ReimbursementBreakup>>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rows, setRows] = useState<EditRow[]>([]);
  const [fullReimbursement, setFullReimbursement] = useState(false);
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
        ? existing.entries.map((e) => ({ label: e.label, amount: (e.amount / 100).toFixed(2) }))
        : [{ label: "", amount: "" }],
    );
    setFullReimbursement(existing?.full_reimbursement ?? false);
  }

  function updateRow(i: number, field: keyof EditRow, value: string) {
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, [field]: value } : r)));
  }

  const totalPaise = rows.reduce((s, r) => s + Math.max(0, Math.round((parseFloat(r.amount) || 0) * 100)), 0);

  async function save() {
    if (selectedId == null) return;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const entries: BreakupEntry[] = rows
        .map((r) => ({
          label: r.label.trim(),
          amount: Math.max(0, Math.round((parseFloat(r.amount) || 0) * 100)),
        }))
        .filter((e) => e.label !== "" || e.amount > 0);
      const saved = await api.put<ReimbursementBreakup>("/admin/reimbursement-breakup", {
        employee_id: selectedId,
        period,
        entries,
        full_reimbursement: fullReimbursement,
      });
      setBreakups((m) => ({ ...m, [selectedId]: saved }));
      const reimbursed = fullReimbursement ? totalPaise : Math.round(totalPaise / 2);
      setStatus(
        `Saved — reimbursing ${formatINR(reimbursed)} (${fullReimbursement ? "100%" : "50%"} of ${formatINR(totalPaise)}).`,
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
        Log the daily reimbursement breakup for the {cycleLabel(period)} cycle. Payroll reimburses{" "}
        <b>50%</b> of the total you enter by default, and shows this breakup in the Payroll reimbursements
        dropdown. Admins can switch a cycle to reimburse the full amount instead.
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
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={fullReimbursement}
              onChange={(e) => setFullReimbursement(e.target.checked)}
            />
            Reimburse 100% instead of 50% (admin-only)
          </label>
          <table>
            <thead>
              <tr>
                <th>Note / day</th>
                <th style={{ width: 160 }}>Amount (INR)</th>
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
                      onChange={(e) => updateRow(i, "label", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      placeholder="0.00"
                      value={r.amount}
                      onChange={(e) => updateRow(i, "amount", e.target.value)}
                    />
                  </td>
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
                  <button type="button" className="link-btn" onClick={() => setRows((rs) => [...rs, { label: "", amount: "" }])}>
                    + Add line
                  </button>
                </td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>{formatINR(totalPaise)}</td>
                <td></td>
              </tr>
              <tr>
                <td className="muted">Reimbursed ({fullReimbursement ? "100%" : "50%"})</td>
                <td className="muted" style={{ textAlign: "right" }}>
                  {formatINR(fullReimbursement ? totalPaise : Math.round(totalPaise / 2))}
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
