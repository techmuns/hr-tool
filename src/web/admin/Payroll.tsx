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
import { allFull, rateLabel } from "../../worker/reimbursementMath";
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
 * "50%", "100%" or "Mixed" for a payroll row's breakup — the badge next to the
 * amount. "Mixed" is the state that only exists because rates are per date, so
 * it has to be visible from the table rather than only inside the dropdown.
 */
function breakupRate(row: AdminPayrollRow): string {
  return rateLabel(parseEntries(row.reimbursement_breakup_entries), row.reimbursement_breakup_full === 1);
}

/**
 * The daily reimbursement breakup HR logged, shown when the reimbursements
 * figure is clicked.
 *
 * The lines themselves stay read-only here — HR writes them in the Reimb.
 * Notes tab — but the 50%/100% rate on each one is editable by any admin, HR
 * or founder. That's per DATE, not per breakup: covering one day's client
 * travel in full while the rest of the cycle stays at half is the actual
 * decision someone reviewing dues makes, and it's the reason each line has its
 * own pill rather than the whole card having one switch.
 */
function BreakupDropdown({
  row,
  onClose,
  saving,
  onToggleEntry,
  onToggleAll,
}: {
  row: AdminPayrollRow;
  onClose: () => void;
  saving: boolean;
  onToggleEntry: (index: number, entry: BreakupEntry) => void;
  onToggleAll: (full: boolean) => void;
}) {
  // Lines written before per-line rates carry no flag; they were logged under
  // the breakup-wide switch, so that is what each of them meant.
  const wasFull = row.reimbursement_breakup_full === 1;
  const entries = parseEntries(row.reimbursement_breakup_entries).map((e) => ({
    ...e,
    full: e.full ?? wasFull,
  }));
  const total = row.reimbursement_breakup_total ?? 0;
  const reimbursed = row.reimbursement_breakup_reimbursed ?? row.reimbursements;
  const everyLineFull = allFull(entries);

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
          minWidth: 290,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,.2)",
          padding: 10,
          textAlign: "left",
          whiteSpace: "normal",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>Daily reimbursement breakup</div>
        <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>
          Click a date's pill to pay that day in full.
        </div>
        <table style={{ width: "100%", fontSize: 13 }}>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i}>
                <td style={{ padding: "2px 0" }}>{e.label || <span className="muted">—</span>}</td>
                <td style={{ padding: "2px 0", textAlign: "right" }}>{formatINR(e.amount)}</td>
                <td style={{ padding: "2px 0 2px 8px", textAlign: "right" }}>
                  <button
                    type="button"
                    className="pct-toggle"
                    data-full={e.full ? "1" : "0"}
                    disabled={saving}
                    title={
                      e.full
                        ? `${e.label || "This line"} is paid in full — click for 50%`
                        : `${e.label || "This line"} is paid at 50% — click to pay ${formatINR(e.amount)} in full`
                    }
                    onClick={() => onToggleEntry(i, e)}
                  >
                    {e.full ? "100%" : "50%"}
                  </button>
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td className="muted" colSpan={3}>
                  No entries logged.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "1px solid var(--border)" }}>
              <td style={{ padding: "4px 0" }}>Total logged</td>
              <td style={{ padding: "4px 0", textAlign: "right" }} colSpan={2}>
                <b>{formatINR(total)}</b>
              </td>
            </tr>
            <tr>
              <td style={{ padding: "2px 0" }} className="muted">
                Reimbursed
              </td>
              <td style={{ padding: "2px 0", textAlign: "right" }} className="muted" colSpan={2}>
                {formatINR(reimbursed)}
              </td>
            </tr>
          </tfoot>
        </table>
        {entries.length > 0 && (
          <div
            style={{
              marginTop: 10,
              paddingTop: 8,
              borderTop: "1px solid var(--border)",
              fontSize: 12,
            }}
          >
            <button
              type="button"
              className="link-btn"
              disabled={saving}
              onClick={() => onToggleAll(!everyLineFull)}
            >
              {saving ? "Saving…" : everyLineFull ? "Set every date back to 50%" : "Pay every date in full"}
            </button>
          </div>
        )}
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
  // Which row's 50%/100% switch is mid-save (by employee_id).
  const [savingFullId, setSavingFullId] = useState<number | null>(null);
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

  /**
   * Move one date — or the whole breakup — between 50% and 100%, from the
   * Payroll table's breakup dropdown. Any admin can do this: it only changes
   * the rate on lines HR already logged, never the lines themselves.
   *
   * `expectedAmount` pins the indexed form to the line the user actually
   * clicked, so if HR edited the breakup in the meantime the server refuses
   * rather than paying out a different date in full.
   */
  async function setReimbursementRate(
    row: AdminPayrollRow,
    full: boolean,
    entry?: { index: number; amount: number },
  ) {
    setSavingFullId(row.employee_id);
    setError(null);
    try {
      await api.patch("/admin/reimbursement-breakup/full", {
        employee_id: row.employee_id,
        period: row.period,
        full_reimbursement: full,
        ...(entry ? { entry_index: entry.index, expected_amount: entry.amount } : {}),
      });
      load({ silent: true, keepSelection: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update reimbursement");
    } finally {
      setSavingFullId(null);
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
                    {/* Amount and rate on one control: the badge says whether
                        this cycle is at 50%, 100% or a mix of the two without
                        anything being opened, and opening it is where the
                        per-date pills are. */}
                    <button
                      type="button"
                      className="link-btn"
                      title="View HR's daily breakup and set each date's 50%/100% rate"
                      onClick={() => setOpenBreakup(openBreakup === row.employee_id ? null : row.employee_id)}
                    >
                      {formatINR(row.reimbursements)}{" "}
                      <span className="pct-badge" data-rate={breakupRate(row)}>
                        {savingFullId === row.employee_id ? "…" : breakupRate(row)}
                      </span>{" "}
                      ▾
                    </button>
                    {openBreakup === row.employee_id && (
                      <BreakupDropdown
                        row={row}
                        onClose={() => setOpenBreakup(null)}
                        saving={savingFullId === row.employee_id}
                        onToggleEntry={(index, entry) =>
                          setReimbursementRate(row, !entry.full, { index, amount: entry.amount })
                        }
                        onToggleAll={(full) => setReimbursementRate(row, full)}
                      />
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
