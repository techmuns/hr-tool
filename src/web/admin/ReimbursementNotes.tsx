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
  percent: 50 | 100; // how much of THIS line is reimbursed
}

/** Reimbursed paise for one edit row: its amount taken at its own percent. */
function rowReimbursed(r: EditRow): number {
  const paise = Math.max(0, Math.round((parseFloat(r.amount) || 0) * 100));
  return Math.round((paise * r.percent) / 100);
}

/**
 * HR-only notepad for the daily reimbursement breakup. HR picks a cycle and a
 * person, writes labelled lines with amounts, and saves. Each line is reimbursed
 * at its OWN rate — 50% or 100% — chosen per line, so one day can pay in full
 * while another pays half. Payroll ADDS this reimbursed total on top of any
 * approved reimbursement requests (the two no longer override each other), and
 * shows the breakup in the Payroll reimbursements dropdown. HR-only: the backend
 * re-checks tier === 'hr' on save regardless of what the client sends. Founders
 * don't see this tab (they can view the breakup on Payroll).
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

  // A line saved before per-line percentages existed carries no `percent`. Read
  // last month's per-line `full` boolean if present (true → 100%, false → 50%),
  // else the breakup's old whole-cycle flag, so an untouched breakup keeps
  // paying exactly what it paid before until HR edits it.
  function entryPercent(e: BreakupEntry, legacyFull: boolean): 50 | 100 {
    if (e.percent === 100) return 100;
    if (e.percent === 50) return 50;
    if (e.full === true) return 100;
    if (e.full === false) return 50;
    return legacyFull ? 100 : 50;
  }

  function selectEmployee(id: number) {
    setSelectedId(id);
    setStatus(null);
    setError(null);
    const existing = breakups[id];
    setRows(
      existing && existing.entries.length
        ? existing.entries.map((e) => ({
            label: e.label,
            amount: (e.amount / 100).toFixed(2),
            percent: entryPercent(e, existing.full_reimbursement),
          }))
        : [{ label: "", amount: "", percent: 50 }],
    );
  }

  function updateRow(i: number, patch: Partial<EditRow>) {
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  }

  function setAllPercent(percent: 50 | 100) {
    setRows((rs) => rs.map((r) => ({ ...r, percent })));
  }

  const totalPaise = rows.reduce((s, r) => s + Math.max(0, Math.round((parseFloat(r.amount) || 0) * 100)), 0);
  const reimbursedPaise = rows.reduce((s, r) => s + rowReimbursed(r), 0);

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
          percent: r.percent,
        }))
        .filter((e) => e.label !== "" || e.amount > 0);
      const saved = await api.put<ReimbursementBreakup>("/admin/reimbursement-breakup", {
        employee_id: selectedId,
        period,
        entries,
      });
      setBreakups((m) => ({ ...m, [selectedId]: saved }));
      setStatus(`Saved — reimbursing ${formatINR(saved.reimbursed_total)} of ${formatINR(saved.total)} logged.`);
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
        <b>50%</b> or <b>100%</b> on its own — the amounts are added to any approved reimbursement requests and shown
        in the Payroll reimbursements dropdown.
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
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 13 }}>
            <span className="muted">Set all lines to:</span>
            <button type="button" className="link-btn" onClick={() => setAllPercent(50)}>
              50%
            </button>
            <button type="button" className="link-btn" onClick={() => setAllPercent(100)}>
              100%
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Note / day</th>
                <th style={{ width: 140 }}>Amount (INR)</th>
                <th style={{ width: 110 }}>Reimburse</th>
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
                      value={r.percent}
                      onChange={(e) => updateRow(i, { percent: Number(e.target.value) === 100 ? 100 : 50 })}
                    >
                      <option value={50}>50%</option>
                      <option value={100}>100%</option>
                    </select>
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
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => setRows((rs) => [...rs, { label: "", amount: "", percent: 50 }])}
                  >
                    + Add line
                  </button>
                </td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>{formatINR(totalPaise)}</td>
                <td colSpan={2}></td>
              </tr>
              <tr>
                <td className="muted">Reimbursed (per line)</td>
                <td className="muted" style={{ textAlign: "right" }}>
                  {formatINR(reimbursedPaise)}
                </td>
                <td colSpan={2}></td>
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
