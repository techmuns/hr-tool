import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { confirmDialog } from "../confirm";
import { formatDate } from "../date";
import { defaultCertificateBody, CERTIFICATE_TYPE_LABEL } from "../../worker/certificate";
import { exportCertificatePdf } from "../certificatePdf";
import type { Certificate, CertificateType, CertificateWithCreator, Employee } from "../types";

/**
 * Leaving certificates and letters of recommendation: fill in who and what,
 * issue it (stores it — nothing is emailed yet), then email and/or download
 * it from the history below, any time, as many times as needed. Mirrors the
 * Payroll tab's split between "generate" and "send": issuing and emailing are
 * separate actions here for the same reason — a certificate you've drafted
 * isn't necessarily ready to go out immediately.
 *
 * The letter body itself is free text HR writes, seeded from a generic
 * starting draft (defaultCertificateBody) — there is no fixed wording for
 * "leaving certificate" the way a payslip has fixed arithmetic, so this stays
 * an editable letter, not a computed document.
 */
export function Certificates({
  presetEmployeeId,
  onConsumedPreset,
}: {
  /** Set when arriving here from "Remove employee" — pre-selects that person and opens the form. */
  presetEmployeeId?: number | null;
  onConsumedPreset?: () => void;
}) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [history, setHistory] = useState<CertificateWithCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [type, setType] = useState<CertificateType>("leaving");
  const [lastWorkingDay, setLastWorkingDay] = useState("");
  const [body, setBody] = useState("");
  const [issuing, setIssuing] = useState(false);

  function loadHistory() {
    setLoading(true);
    setError(null);
    api
      .get<CertificateWithCreator[]>("/admin/certificates", { force: true })
      .then(setHistory)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }

  useEffect(loadHistory, []);
  useEffect(() => {
    api.get<Employee[]>("/employees").then(setEmployees).catch(() => {});
  }, []);

  useEffect(() => {
    if (presetEmployeeId == null) return;
    setEmployeeId(String(presetEmployeeId));
    setType("leaving");
    setShowForm(true);
    onConsumedPreset?.();
    // Only the preset value matters here — re-running when the callback
    // identity changes would re-open the form on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetEmployeeId]);

  const selectedEmployee = useMemo(
    () => employees.find((e) => String(e.id) === employeeId) ?? null,
    [employees, employeeId],
  );

  // Regenerate the draft whenever who it's for or what kind changes — a draft
  // customized for one person doesn't make sense once the selection moves to
  // someone else, so overwriting rather than preserving it is the right call.
  useEffect(() => {
    if (!selectedEmployee) return;
    setBody(
      defaultCertificateBody(type, {
        employee_name: selectedEmployee.name,
        job_title: selectedEmployee.job_title,
        date_of_joining: selectedEmployee.date_of_joining,
        last_working_day: lastWorkingDay || null,
      }),
    );
    // lastWorkingDay deliberately excluded: typing a date shouldn't blow away
    // whatever HR has already started editing in the body.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmployee, type]);

  async function issue() {
    if (!employeeId) {
      setError("Pick who this certificate is for");
      return;
    }
    if (type === "leaving" && !lastWorkingDay) {
      setError("Last working day is required for a leaving certificate");
      return;
    }
    if (!body.trim()) {
      setError("Letter body is required");
      return;
    }
    setIssuing(true);
    setError(null);
    try {
      await api.post("/admin/certificates", {
        employee_id: Number(employeeId),
        type,
        last_working_day: type === "leaving" ? lastWorkingDay : undefined,
        body: body.trim(),
      });
      setShowForm(false);
      setEmployeeId("");
      setLastWorkingDay("");
      setBody("");
      loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to issue certificate");
    } finally {
      setIssuing(false);
    }
  }

  async function emailCertificate(cert: CertificateWithCreator) {
    setBusyId(cert.id);
    setError(null);
    try {
      await api.post(`/admin/certificates/${cert.id}/email`);
      loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send certificate");
    } finally {
      setBusyId(null);
    }
  }

  async function removeCertificate(cert: CertificateWithCreator) {
    const ok = await confirmDialog(`Delete this ${CERTIFICATE_TYPE_LABEL[cert.type]} for ${cert.employee_name}?`, {
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setBusyId(cert.id);
    setError(null);
    try {
      await api.del(`/admin/certificates/${cert.id}`);
      setHistory((rows) => rows.filter((r) => r.id !== cert.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete certificate");
    } finally {
      setBusyId(null);
    }
  }

  function download(cert: Certificate) {
    exportCertificatePdf(cert);
  }

  return (
    <Card
      title="Certificates"
      actions={
        <Button variant="primary" onClick={() => setShowForm((v) => !v)}>
          + Issue certificate
        </Button>
      }
    >
      {error && <p className="error-text">{error}</p>}

      {showForm && (
        <div className="inline-form">
          <div className="row">
            <div className="field">
              <label>Employee</label>
              <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="">Select…</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Type</label>
              <select value={type} onChange={(e) => setType(e.target.value as CertificateType)}>
                <option value="leaving">Leaving Certificate</option>
                <option value="lor">Letter of Recommendation</option>
              </select>
            </div>
            {type === "leaving" && (
              <div className="field">
                <label>Last working day</label>
                <input type="date" value={lastWorkingDay} onChange={(e) => setLastWorkingDay(e.target.value)} />
              </div>
            )}
          </div>
          <div className="field">
            <label>Letter</label>
            <textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
            <p className="field-hint">
              Starting draft — edit freely before issuing. Blank lines separate paragraphs.
            </p>
          </div>
          <div className="inline-form-actions">
            <Button onClick={() => setShowForm(false)} disabled={issuing}>
              Cancel
            </Button>
            <Button variant="primary" onClick={issue} disabled={issuing}>
              {issuing ? "Issuing…" : "Issue certificate"}
            </Button>
          </div>
        </div>
      )}

      <h3 className="drawer-section">History</h3>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Issued</th>
              <th>Employee</th>
              <th>Type</th>
              <th>Emailed</th>
              <th>Issued by</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {history.map((cert) => (
              <tr key={cert.id}>
                <td>{formatDate(cert.created_at)}</td>
                <td>{cert.employee_name}</td>
                <td>{CERTIFICATE_TYPE_LABEL[cert.type]}</td>
                <td>
                  {cert.emailed_at ? (
                    <span className="muted" title={cert.emailed_to ?? undefined}>
                      Sent {formatDate(cert.emailed_at)}
                    </span>
                  ) : (
                    <span className="muted">Not sent</span>
                  )}
                </td>
                <td className="muted">{cert.created_by_name ?? "—"}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button type="button" className="link-btn" disabled={busyId === cert.id} onClick={() => download(cert)}>
                    Download PDF
                  </button>
                  <button
                    type="button"
                    className="link-btn"
                    style={{ marginLeft: 8 }}
                    disabled={busyId === cert.id}
                    onClick={() => emailCertificate(cert)}
                  >
                    {busyId === cert.id ? "Sending…" : cert.emailed_at ? "Resend" : "Email"}
                  </button>
                  <button
                    type="button"
                    className="row-remove-btn"
                    style={{ marginLeft: 8 }}
                    title="Delete this certificate"
                    disabled={busyId === cert.id}
                    onClick={() => removeCertificate(cert)}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No certificates issued yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </Card>
  );
}
