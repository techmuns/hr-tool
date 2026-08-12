import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { formatDate, todayISODate } from "../date";
import { confirmDialog } from "../confirm";
import { formatINR } from "../money";
import { exportPayrollPdf } from "../pdf";
import { exportPayslipPdf } from "../payslipPdf";
import { cycleLabel, payDueDate, periodForDate } from "../../worker/payslip";
import { AdjustmentsSection } from "./Adjustments";
import type { AdminPayrollRow, BreakupEntry, CycleAdjustments } from "../types";

function parseEntries(json: string | null): BreakupEntry[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * The daily reimbursement breakup HR logged, shown when the reimbursements
 * total is clicked. Read-only here (HR edits it in the Reimb. Notes tab); the
 * payroll figure above is half this total, spelled out at the bottom.
 */
function BreakupDropdown({ row, onClose }: { row: AdminPayrollRow; onClose: () => void }) {
  const entries = parseEntries(row.reimbursement_breakup_entries);
  const total = row.reimbursement_breakup_total ?? 0;
  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={onClose} />
      <div
        style={{
          position: "absolute",
          zIndex: 50,
          top: "100%",
          left: 0,
          marginTop: 4,
          minWidth: 250,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,.2)",
          padding: 10,
          textAlign: "left",
          whiteSpace: "normal",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Daily reimbursement breakup</div>
        <table style={{ width: "100%", fontSize: 13 }}>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i}>
                <td style={{ padding: "2px 0" }}>{e.label || <span className="muted">—</span>}</td>
                <td style={{ padding: "2px 0", textAlign: "right" }}>{formatINR(e.amount)}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td className="muted" colSpan={2}>
                  No entries logged.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "1px solid var(--border)" }}>
              <td style={{ padding: "4px 0" }}>Total logged</td>
              <td style={{ padding: "4px 0", textAlign: "right" }}>
                <b>{formatINR(total)}</b>
              </td>
            </tr>
            <tr>
              <td style={{ padding: "2px 0" }} className="muted">
                Reimbursed (50%)
              </td>
              <td style={{ padding: "2px 0", textAlign: "right" }} className="muted">
                {formatINR(Math.round(total / 2))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

interface EmailResult {
  sent: string[];
  failed: { name: string; error: string }[];
}

/**
 * One cycle, one screen: what everyone is being paid, and everything that
 * decides it.
 *
 * Payslips and adjustments used to be separate tabs, each with its own month
 * picker. Now that payroll recomputes from its inputs on every read, that split
 * only made the automation invisible — you approved something in one tab and
 * had to go and look in another to see whether it had landed. Together, an
 * approval visibly moves a net-pay figure a few rows up the same page.
 *
 * This component owns the period and the loading; the adjustment panes below
 * call onChanged after every write, which reloads BOTH halves so the payslip
 * table never lags behind the thing that changed it.
 */
export function Payroll() {
  // Default to the ACTIVE billing cycle, not the calendar month: cycles run
  // 11th-to-10th and are paid on the 11th, so once the 11th passes the current
  // cycle is next month's period (a fresh, zeroed one) — which is what should
  // show, rather than the just-paid cycle frozen as "dues paid".
  const [period, setPeriod] = useState(periodForDate(todayISODate()));
  const [rows, setRows] = useState<AdminPayrollRow[]>([]);
  const [adjustments, setAdjustments] = useState<CycleAdjustments | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [paidBusy, setPaidBusy] = useState(false);
  // Which single person's paid state is in flight (per-row "Mark paid"),
  // separate from the cycle-wide `paidBusy` above.
  const [paidBusyId, setPaidBusyId] = useState<number | null>(null);
  // Which row's reimbursement breakup dropdown is open (by employee_id).
  const [openBreakup, setOpenBreakup] = useState<number | null>(null);
  const [emailingIds, setEmailingIds] = useState<number[]>([]);
  const [result, setResult] = useState<EmailResult | null>(null);
  // Who gets a payslip on the next bulk send. Seeded from the loaded rows, then
  // owned by the user's checkbox clicks until the period changes.
  const [selected, setSelected] = useState<Set<number>>(new Set());

  /**
   * Reads the cycle. GET /admin/payroll recomputes the period server-side
   * before returning, so this doubles as "recalculate" — there is nothing else
   * to press. `force` skips the 20s GET cache, which would otherwise serve a
   * stale answer right after a write.
   *
   * The two requests are independent: syncing payroll cannot change anything
   * the adjustments response reports, so they run in parallel.
   */
  function load(opts: { silent?: boolean; keepSelection?: boolean } = {}) {
    if (!opts.silent) {
      setLoading(true);
      setError(null);
    }
    Promise.all([
      api.get<AdminPayrollRow[]>(`/admin/payroll?period=${period}`, { force: true }),
      api.get<CycleAdjustments>(`/admin/adjustments?period=${period}`, { force: true }),
    ])
      .then(([payroll, adj]) => {
        setRows(payroll);
        setAdjustments(adj);
        // Default to everyone we can actually reach; people with no address on
        // file start unchecked rather than failing later. A background refresh
        // keeps the user's current checkbox selection instead of reseeding it.
        if (!opts.keepSelection) {
          setSelected(new Set(payroll.filter((r) => r.employee_email).map((r) => r.employee_id)));
        }
      })
      .catch((err) => {
        if (!opts.silent) setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!opts.silent) setLoading(false);
      });
  }

  useEffect(() => {
    setResult(null);
    load();
  }, [period]);

  // Keep the cycle current on its own: once dues are marked paid and payslips
  // emailed, that paid/sent state should appear without anyone pressing Refresh
  // (including for a founder just watching the tab). Polls quietly — no spinner,
  // keeps the email selection — and pauses on a hidden tab or mid-action.
  const busyRef = useRef(false);
  busyRef.current =
    loading || paidBusy || paidBusyId !== null || emailingIds.length > 0 || openBreakup !== null;
  useEffect(() => {
    const tick = () => {
      if (!document.hidden && !busyRef.current) load({ silent: true, keepSelection: true });
    };
    const id = setInterval(tick, 30000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const paidCount = rows.filter((r) => r.paid_at).length;
  const allPaid = rows.length > 0 && paidCount === rows.length;
  const paidOn = rows.find((r) => r.paid_at)?.paid_at ?? null;
  const mailable = useMemo(() => rows.filter((r) => r.employee_email), [rows]);
  const selectedCount = rows.filter((r) => selected.has(r.employee_id)).length;
  const pendingCount = adjustments?.pending.length ?? 0;

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
        `Mark the ${cycleLabel(period)} cycle as paid for all ${rows.length} people on this payroll?` +
          (pendingCount > 0
            ? ` ${pendingCount} reimbursement${pendingCount === 1 ? " is" : "s are"} still awaiting approval and won't be included.`
            : ""),
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

  // Per-row "Mark paid" / "Undo", settling just this one person for the cycle.
  async function setEmployeePaid(employeeId: number, paid: boolean) {
    setPaidBusyId(employeeId);
    setError(null);
    try {
      await api.post("/admin/payroll/paid", { period, paid, employee_id: employeeId });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update payment status");
    } finally {
      setPaidBusyId(null);
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
          <Button disabled={busy} onClick={() => load()} title="Re-read this cycle">
            {loading ? "Refreshing…" : "Refresh"}
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
                  11 Jul – 10 Aug — spell that out so the two can't be confused. */}
              {` · cycle ${cycleLabel(period)}`}
              {allPaid && paidOn
                ? ` · marked paid ${formatDate(paidOn)}`
                : ` · due ${formatDate(payDueDate(period))}`}
              {!allPaid && paidCount > 0 && ` · ${paidCount} of ${rows.length} already marked`}
              {/* Says which of the two states these figures are in, since that
                  decides whether an approval made now would still move them. */}
              {allPaid ? " · figures frozen as paid" : " · updates live"}
              {pendingCount > 0 && ` · ${pendingCount} awaiting approval below`}
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
            <th title="In-office days for in-office & hybrid staff — present days this cycle minus WFH days (auto)">In office</th>
            <th title="Days HR marked work-from-home this cycle (nothing is counted automatically)">WFH days</th>
            <th>Deductions</th>
            <th>Net Pay</th>
            <th>Paid</th>
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
              <td>
                {row.reimbursement_breakup_entries ? (
                  <span style={{ position: "relative", display: "inline-block" }}>
                    <button
                      type="button"
                      className="link-btn"
                      title="View HR's daily breakup (payroll reimburses 50% of it)"
                      onClick={() => setOpenBreakup(openBreakup === row.employee_id ? null : row.employee_id)}
                    >
                      {formatINR(row.reimbursements)} ▾
                    </button>
                    {openBreakup === row.employee_id && (
                      <BreakupDropdown row={row} onClose={() => setOpenBreakup(null)} />
                    )}
                  </span>
                ) : (
                  formatINR(row.reimbursements)
                )}
              </td>
              <td>{row.paid_days}</td>
              <td
                title={
                  row.work_mode === "in-office" || row.work_mode === "hybrid"
                    ? `${Math.max(0, row.present_days - row.wfh_days)} in-office of ${row.present_days} present days (minus ${row.wfh_days} WFH)`
                    : "Remote employee"
                }
              >
                {row.work_mode === "in-office" || row.work_mode === "hybrid" ? (
                  Math.max(0, row.present_days - row.wfh_days)
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td title={`${row.wfh_days} day${row.wfh_days === 1 ? "" : "s"} marked WFH this cycle`}>
                {row.wfh_days > 0 ? row.wfh_days : <span className="muted">—</span>}
              </td>
              <td
                title={`Unpaid leave ${formatINR(row.leave_deductions)} · manual ${formatINR(row.other_deductions)}`}
              >
                {formatINR(row.deductions)}
              </td>
              <td>{formatINR(row.net_pay)}</td>
              <td>
                {row.paid_at ? (
                  <>
                    <span className="muted" style={{ fontSize: 12 }} title={`Paid ${formatDate(row.paid_at)}`}>
                      Paid {formatDate(row.paid_at)}
                    </span>
                    <button
                      type="button"
                      className="link-btn"
                      style={{ marginLeft: 8 }}
                      disabled={busy || paidBusyId === row.employee_id}
                      title="Reopen this person's pay for the cycle"
                      onClick={() => setEmployeePaid(row.employee_id, false)}
                    >
                      Undo
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy || paidBusyId === row.employee_id}
                    onClick={() => setEmployeePaid(row.employee_id, true)}
                  >
                    {paidBusyId === row.employee_id ? "Marking…" : "Mark paid"}
                  </button>
                )}
              </td>
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
                <button
                  type="button"
                  className="link-btn"
                  style={{ marginLeft: 8 }}
                  title="Download this person's payslip as a PDF, matching the emailed card"
                  onClick={() => exportPayslipPdf(row)}
                >
                  PDF
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
              <td colSpan={12} className="muted">
                {loading ? "Loading…" : "Nobody is on payroll for this period."}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <AdjustmentsSection
        period={period}
        data={adjustments}
        busy={busy}
        onChanged={load}
        onError={setError}
      />
    </Card>
  );
}
