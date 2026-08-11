import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import { Tag } from "../components/ui/Tag";
import { confirmDialog } from "../confirm";
import { formatDate } from "../date";
import { EmployeePanel } from "./EmployeePanel";
import type { Employee } from "../types";

/**
 * The Archived tab: people kept for the record but pulled out of attendance,
 * payroll and the active directory. Open one to see their retained history
 * (the same panel as the directory) or restore them to active.
 */
export function ArchivedEmployees({
  onGoToCertificates,
}: {
  onGoToCertificates: (employeeId: number) => void;
}) {
  const [rows, setRows] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [panelTarget, setPanelTarget] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get<Employee[]>("/employees?archived=1")
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function restore(emp: Employee) {
    const ok = await confirmDialog(`Restore ${emp.name} to the active directory?`, { confirmLabel: "Restore" });
    if (!ok) return;
    setRestoringId(emp.id);
    setError(null);
    try {
      await api.post(`/admin/employees/${emp.id}/archive`, { archived: false });
      setRows((list) => list.filter((e) => e.id !== emp.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore");
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <Card title="Archived employees">
      {error && <p className="error-text">{error}</p>}
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Archived people are kept for the record but hidden from attendance and payroll. Open one to see their
        history, or restore them to the active directory.
      </p>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Designation</th>
            <th>Joined</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((emp) => (
            <tr key={emp.id}>
              <td>
                <button type="button" className="hm-name-btn" onClick={() => setPanelTarget(emp.id)}>
                  {emp.name}
                </button>
                {emp.employment_type !== "employee" && (
                  <span style={{ marginLeft: 6 }}>
                    <Tag value={emp.employment_type} />
                  </span>
                )}
              </td>
              <td>{emp.email || <span className="muted">—</span>}</td>
              <td>{emp.job_title || <span className="muted">—</span>}</td>
              <td>{emp.tier === "founder" ? <span className="muted">—</span> : formatDate(emp.date_of_joining)}</td>
              <td>
                <button
                  type="button"
                  className="link-btn"
                  disabled={restoringId === emp.id}
                  onClick={() => restore(emp)}
                >
                  {restoringId === emp.id ? "Restoring…" : "Restore"}
                </button>
              </td>
            </tr>
          ))}
          {loading && (
            <tr>
              <td colSpan={5} className="muted">
                Loading…
              </td>
            </tr>
          )}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No archived employees.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {panelTarget !== null && (
        <EmployeePanel
          target={panelTarget}
          onClose={() => setPanelTarget(null)}
          onChanged={load}
          onGoToCertificates={onGoToCertificates}
        />
      )}
    </Card>
  );
}
