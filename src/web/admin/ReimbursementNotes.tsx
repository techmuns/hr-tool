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
  /** Reimburse this one line in full instead of the standard 50%. */
  full: boolean;
}

/** Paise for one edit row, from the rupees the user typed. */
function rowPaise(r: EditRow): number {
  return Math.max(0, Math.round((parseFloat(r.amount) || 0) * 100));
}

/**
 * HR-only notepad for the daily reimbursement breakup. HR picks a cycle and a
 * person, writes labelled lines with amounts, and saves; payroll then shows the
 * breakup in the Payroll reimbursements dropdown.
 *
 * Each line carries its own 50%/100% rate — a day's client travel can be
 * covered in full while the rest of the cycle is halved — so the payout is a
 * per-line sum, not a percentage of the total. Founders don't see this tab, but
 * they can change those rates from the Payroll tab; only HR can add, remove or
 * re-label the lines, which the backend re-checks on save.
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
        ? existing.entries.map((e) => ({
            label: e.label,
            amount: (e.amount / 100).toFixed(2),
            // The GET resolves legacy flagless lines against the row's switch,
            // so `full` is already the truth for each line by the time it lands.
            full: e.full === true,
          }))
        : [{ label: "", amount: "", full: false }],
    );
  }

  function updateRow(i: number, field: "label" | "amount", value: string) {
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, [field]: value } : r)));
  }

  function toggleRowFull(i: number) {
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, full: !r.full } : r)));
  }

  const totalPaise = rows.reduce((s, r) => s + rowPaise(r), 0);
  // Same per-line arithmetic the server will do, so the preview and the saved
  // figure cannot disagree.
  const reimbursedPaise = rows.reduce(
    (s, r) => s + (r.full ? rowPaise(r) : Math.round(rowPaise(r) / 2)),
    0,
  );

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
        Log the daily reimbursement breakup for the {cycleLabel(period)} cycle. Payroll reimburses{" "}
        <b>50%</b> of each line by default; use the pill on a line to pay that day in full. The breakup
        also shows in the Payroll reimbursements dropdown, where the same rates can be changed.
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
                <th style={{ width: 160 }}>Amount (INR)</th>
                <th style={{ width: 70 }} title="What payroll covers of this line">
                  Rate
                </th>
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
                      className="pct-toggle"
                      data-full={r.full ? "1" : "0"}
                      title={
                        r.full
                          ? "Paid in full — click to reimburse 50% of this line"
                          : "Paid at 50% — click to reimburse this line in full"
                      }
                      onClick={() => toggleRowFull(i)}
                    >
                      {r.full ? "100%" : "50%"}
                    </button>
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
                    onClick={() => setRows((rs) => [...rs, { label: "", amount: "", full: false }])}
                  >
                    + Add line
                  </button>
                </td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>{formatINR(totalPaise)}</td>
                <td colSpan={2}></td>
              </tr>
              <tr>
                <td className="muted">Reimbursed</td>
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
