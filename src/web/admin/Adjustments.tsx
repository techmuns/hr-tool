import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Button } from "../components/ui/Button";
import { Tag } from "../components/ui/Tag";
import { BILLS_ENABLED, BillLink } from "../components/Bill";
import { confirmDialog } from "../confirm";
import { formatDate, todayISODate } from "../date";
import { formatINR } from "../money";
import { cycleLabel, periodForDate } from "../../worker/payslip";
import type { CycleAdjustments, Employee, ReimbursementStatus } from "../types";

/**
 * Everything that pushes a cycle's pay off the plain monthly salary:
 * reimbursements waiting on HR, the ones already decided, deductions HR books
 * by hand, and what unpaid leave is costing.
 *
 * A section of the Payroll tab rather than a tab of its own — the period, the
 * data and the loading all belong to the parent, so there is exactly one month
 * picker and one refresh for the cycle. Every write here calls onChanged, which
 * reloads the payslip table above too; that is what makes an approval visibly
 * move a net-pay figure instead of quietly changing a number somewhere else.
 */
export function AdjustmentsSection({
  period,
  data,
  busy,
  onChanged,
  onError,
}: {
  period: string;
  data: CycleAdjustments | null;
  /** Parent is mid-request; keeps the two halves from being driven at once. */
  busy: boolean;
  onChanged: () => void;
  onError: (message: string | null) => void;
}) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [addingReim, setAddingReim] = useState(false);
  const [reimEmployee, setReimEmployee] = useState("");
  const [reimAmount, setReimAmount] = useState("");
  const [reimNote, setReimNote] = useState("");
  const [reimBusy, setReimBusy] = useState(false);

  // Rejection reasons, kept per pending row so typing in one doesn't touch another.
  const [notes, setNotes] = useState<Record<number, string>>({});

  const [adding, setAdding] = useState(false);
  const [dedEmployee, setDedEmployee] = useState("");
  const [dedAmount, setDedAmount] = useState("");
  const [dedNote, setDedNote] = useState("");
  const [dedBusy, setDedBusy] = useState(false);

  useEffect(() => {
    api.get<Employee[]>("/employees").then(setEmployees).catch(() => {});
  }, []);

  // Adjustments are a payroll concept, so only people payroll actually runs for.
  const payrollEmployees = useMemo(() => employees.filter((e) => e.on_payroll !== 0), [employees]);

  // Which cycle a reimbursement filed right now would fall into — not
  // necessarily the one being viewed, since the month picker moves freely.
  const todaysPeriod = periodForDate(todayISODate());

  const pending = data?.pending ?? [];
  const decided = data?.reimbursements ?? [];
  const deductions = data?.deductions ?? [];
  const leave = data?.leave ?? [];

  const deductionTotal = useMemo(() => deductions.reduce((s, d) => s + d.amount, 0), [deductions]);
  const leaveTotal = useMemo(() => leave.reduce((s, l) => s + l.amount, 0), [leave]);

  async function decide(id: number, status: ReimbursementStatus, employeeName: string, amount: number) {
    if (status === "rejected") {
      const ok = await confirmDialog(`Reject ${employeeName}'s ${formatINR(amount)} reimbursement?`, {
        confirmLabel: "Reject",
        danger: true,
      });
      if (!ok) return;
    }
    setBusyId(id);
    onError(null);
    try {
      await api.patch(`/admin/reimbursements/${id}/status`, { status, note: notes[id] ?? "" });
      setNotes((n) => {
        const next = { ...n };
        delete next[id];
        return next;
      });
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to update reimbursement");
    } finally {
      setBusyId(null);
    }
  }

  /**
   * File a reimbursement on someone's behalf. Goes to the same endpoint the
   * employee drawer uses, which marks it approved on the spot — HR entering it
   * IS the approval, so routing it into the queue below for HR to then approve
   * to themselves would be a pointless round trip.
   */
  async function addReimbursement() {
    const employeeId = Number(reimEmployee);
    const rupees = parseFloat(reimAmount);
    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      onError("Pick who the reimbursement is for");
      return;
    }
    if (!rupees || rupees <= 0) {
      onError("Enter a reimbursement amount greater than 0");
      return;
    }
    setReimBusy(true);
    onError(null);
    try {
      await api.post(`/admin/employees/${employeeId}/reimbursements`, {
        amount: Math.round(rupees * 100),
        note: reimNote.trim(),
      });
      setReimEmployee("");
      setReimAmount("");
      setReimNote("");
      setAddingReim(false);
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to add reimbursement");
    } finally {
      setReimBusy(false);
    }
  }

  async function addDeduction() {
    const employeeId = Number(dedEmployee);
    const rupees = parseFloat(dedAmount);
    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      onError("Pick who the deduction is for");
      return;
    }
    if (!rupees || rupees <= 0) {
      onError("Enter a deduction amount greater than 0");
      return;
    }
    setDedBusy(true);
    onError(null);
    try {
      await api.post("/admin/deductions", {
        employee_id: employeeId,
        period,
        amount: Math.round(rupees * 100),
        note: dedNote.trim(),
      });
      setDedEmployee("");
      setDedAmount("");
      setDedNote("");
      setAdding(false);
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to add deduction");
    } finally {
      setDedBusy(false);
    }
  }

  async function removeDeduction(id: number, name: string, amount: number) {
    const ok = await confirmDialog(`Remove the ${formatINR(amount)} deduction on ${name}?`, {
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    setBusyId(id);
    onError(null);
    try {
      await api.del(`/admin/deductions/${id}`);
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to remove deduction");
    } finally {
      setBusyId(null);
    }
  }

  const frozen = data?.paid ?? false;
  const rowBusy = (id: number) => busy || busyId === id;

  return (
    <>
      <h3 className="drawer-section section-group">Adjustments · {cycleLabel(period)}</h3>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        {frozen ? (
          <>
            This cycle&rsquo;s dues are marked paid, so the payslip figures above are frozen at what was paid out.
            Changes here no longer move them — use <strong>Mark unpaid</strong> to reopen the cycle if it genuinely
            has to change.
          </>
        ) : (
          <>The table above recalculates from these as you go — anything you approve or add lands on it immediately.</>
        )}
      </p>

      <h4 className="drawer-section">Reimbursements awaiting approval ({pending.length})</h4>
      <Button onClick={() => setAddingReim((v) => !v)} disabled={reimBusy || busy}>
        + Add reimbursement
      </Button>
      {addingReim && (
        <div className="inline-form">
          <div className="row">
            <div className="field">
              <label>Employee</label>
              <select value={reimEmployee} onChange={(e) => setReimEmployee(e.target.value)}>
                <option value="">Select…</option>
                {payrollEmployees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Amount (INR)</label>
              <input type="number" step="0.01" value={reimAmount} onChange={(e) => setReimAmount(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Note</label>
            <input
              type="text"
              placeholder="Travel, meals, equipment, etc."
              value={reimNote}
              onChange={(e) => setReimNote(e.target.value)}
            />
          </div>
          <p className="field-hint">
            Approved on the spot, since you&rsquo;re the one adding it. A reimbursement is dated by when it is filed,
            so this one lands in the {cycleLabel(todaysPeriod)} cycle
            {todaysPeriod === period ? " — the one shown above." : `, not the ${cycleLabel(period)} cycle shown above.`}
          </p>
          <div className="inline-form-actions">
            <Button onClick={() => setAddingReim(false)} disabled={reimBusy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={addReimbursement} disabled={reimBusy}>
              {reimBusy ? "Adding…" : "Add"}
            </Button>
          </div>
        </div>
      )}
      <table>
        <thead>
          <tr>
            <th>Filed</th>
            <th>Employee</th>
            <th>Note</th>
            <th>Amount</th>
            {BILLS_ENABLED && <th>Bill</th>}
            <th>Reason (optional)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pending.map((r) => (
            <tr key={r.id}>
              <td>{formatDate(r.created_at)}</td>
              <td>{r.employee_name}</td>
              <td>{r.note || <span className="muted">—</span>}</td>
              <td>{formatINR(r.amount)}</td>
              {BILLS_ENABLED && (
                <td>
                  <BillLink reimbursement={r} />
                </td>
              )}
              <td>
                <input
                  type="text"
                  placeholder="Reason"
                  value={notes[r.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                />
              </td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button
                  type="button"
                  className="link-btn"
                  disabled={rowBusy(r.id)}
                  onClick={() => decide(r.id, "approved", r.employee_name, r.amount)}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="link-btn"
                  style={{ marginLeft: 8 }}
                  disabled={rowBusy(r.id)}
                  onClick={() => decide(r.id, "rejected", r.employee_name, r.amount)}
                >
                  Reject
                </button>
              </td>
            </tr>
          ))}
          {pending.length === 0 && (
            <tr>
              <td colSpan={BILLS_ENABLED ? 7 : 6} className="muted">
                Nothing waiting on approval.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h4 className="drawer-section">Decided this cycle</h4>
      <table>
        <thead>
          <tr>
            <th>Filed</th>
            <th>Employee</th>
            <th>Note</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Decided by</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {decided.map((r) => (
            <tr key={r.id}>
              <td>{formatDate(r.created_at)}</td>
              <td>{r.employee_name}</td>
              <td>
                {r.note || <span className="muted">—</span>}
                {r.decision_note && <div className="muted" style={{ fontSize: 12 }}>“{r.decision_note}”</div>}
              </td>
              <td>{formatINR(r.amount)}</td>
              <td>
                <Tag value={r.status} />
              </td>
              <td className="muted">
                {r.decided_by_name ?? "—"}
                {r.decided_at && ` · ${formatDate(r.decided_at)}`}
              </td>
              <td>
                <button
                  type="button"
                  className="link-btn"
                  title="Put this back in the approval queue"
                  disabled={rowBusy(r.id)}
                  onClick={() => decide(r.id, "pending", r.employee_name, r.amount)}
                >
                  Undo
                </button>
              </td>
            </tr>
          ))}
          {decided.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">
                No reimbursements decided for this cycle.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h4 className="drawer-section">Manual deductions · {formatINR(deductionTotal)}</h4>
      <Button onClick={() => setAdding((v) => !v)} disabled={dedBusy || busy}>
        + Add deduction
      </Button>
      {adding && (
        <div className="inline-form">
          <div className="row">
            <div className="field">
              <label>Employee</label>
              <select value={dedEmployee} onChange={(e) => setDedEmployee(e.target.value)}>
                <option value="">Select…</option>
                {payrollEmployees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Amount (INR)</label>
              <input type="number" step="0.01" value={dedAmount} onChange={(e) => setDedAmount(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Note</label>
            <input
              type="text"
              placeholder="Salary advance, equipment damage, etc."
              value={dedNote}
              onChange={(e) => setDedNote(e.target.value)}
            />
          </div>
          <p className="field-hint">Charged to the {cycleLabel(period)} cycle.</p>
          <div className="inline-form-actions">
            <Button onClick={() => setAdding(false)} disabled={dedBusy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={addDeduction} disabled={dedBusy}>
              {dedBusy ? "Adding…" : "Add"}
            </Button>
          </div>
        </div>
      )}
      <table>
        <thead>
          <tr>
            <th>Added</th>
            <th>Employee</th>
            <th>Note</th>
            <th>Amount</th>
            <th>Added by</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {deductions.map((d) => (
            <tr key={d.id}>
              <td>{formatDate(d.created_at)}</td>
              <td>{d.employee_name}</td>
              <td>{d.note || <span className="muted">—</span>}</td>
              <td>{formatINR(d.amount)}</td>
              <td className="muted">{d.created_by_name ?? "—"}</td>
              <td>
                <button
                  type="button"
                  className="row-remove-btn"
                  title="Remove deduction"
                  disabled={rowBusy(d.id)}
                  onClick={() => removeDeduction(d.id, d.employee_name, d.amount)}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
          {deductions.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No manual deductions on this cycle.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h4 className="drawer-section">Leave deductions · {formatINR(leaveTotal)}</h4>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Derived from approved unpaid leave falling inside this cycle — not editable here. Change the leave itself to
        change these.
      </p>
      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th>Unpaid days</th>
            <th>Monthly salary</th>
            <th>Deduction</th>
          </tr>
        </thead>
        <tbody>
          {leave.map((l) => (
            <tr key={l.employee_id}>
              <td>{l.employee_name}</td>
              <td>{l.unpaid_days}</td>
              <td>{formatINR(l.monthly_salary)}</td>
              <td>{formatINR(l.amount)}</td>
            </tr>
          ))}
          {leave.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                No unpaid leave in this cycle.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
