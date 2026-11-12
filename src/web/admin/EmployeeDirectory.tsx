import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Tag } from "../components/ui/Tag";
import { confirmDialog } from "../confirm";
import { formatDate } from "../date";
import { EmployeePanel } from "./EmployeePanel";
import type { Employee, WorkMode } from "../types";

const WORK_MODE_LABEL: Record<WorkMode, string> = {
  "in-office": "In-office",
  wfh: "WFH / Online",
  hybrid: "Hybrid",
};

export function EmployeeDirectory() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [panelTarget, setPanelTarget] = useState<number | "new" | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const [workModeFilter, setWorkModeFilter] = useState("");
  const [employmentFilter, setEmploymentFilter] = useState("");

  function load() {
    api
      .get<Employee[]>("/employees")
      .then(setEmployees)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }

  useEffect(load, []);

  async function remove(emp: Employee) {
    const ok = await confirmDialog(
      `Delete ${emp.name}? This permanently deletes their attendance, leaves, payroll, reimbursements and chat, and can't be undone. To keep their record instead, open them and choose Archive.`,
      { confirmLabel: "Delete", danger: true },
    );
    if (!ok) return;
    setDeletingId(emp.id);
    setError(null);
    try {
      await api.del(`/employees/${emp.id}`);
      setEmployees((list) => list.filter((e) => e.id !== emp.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (workModeFilter && e.work_mode !== workModeFilter) return false;
      if (employmentFilter && e.employment_type !== employmentFilter) return false;
      if (q) {
        const haystack = `${e.name} ${e.email} ${e.job_title}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [employees, search, workModeFilter, employmentFilter]);

  return (
    <Card
      title="Employees"
      actions={
        <Button variant="primary" onClick={() => setPanelTarget("new")}>
          + Add employee
        </Button>
      }
    >
      {error && <p className="error-text">{error}</p>}

      <div className="row" style={{ marginBottom: 14 }}>
        <div className="field">
          <label>Search</label>
          <input
            type="text"
            placeholder="Name, email, designation…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Work mode</label>
          <select value={workModeFilter} onChange={(e) => setWorkModeFilter(e.target.value)}>
            <option value="">All modes</option>
            <option value="in-office">In-office</option>
            <option value="wfh">WFH / Online</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </div>
        <div className="field">
          <label>Employment</label>
          <select value={employmentFilter} onChange={(e) => setEmploymentFilter(e.target.value)}>
            <option value="">All</option>
            <option value="employee">Employees</option>
            <option value="freelancer">Freelancers</option>
            <option value="intern">Interns</option>
          </select>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Designation</th>
            <th>Type</th>
            <th>Joined</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((emp) => (
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
              <td>{WORK_MODE_LABEL[emp.work_mode]}</td>
              <td>{emp.tier === "founder" ? <span className="muted">—</span> : formatDate(emp.date_of_joining)}</td>
              <td>
                {/* HR and founder (admin) accounts can't be deleted — the server refuses. */}
                {emp.role !== "admin" && (
                  <button
                    type="button"
                    className="link-btn danger"
                    disabled={deletingId === emp.id}
                    onClick={() => remove(emp)}
                  >
                    {deletingId === emp.id ? "Deleting…" : "Delete"}
                  </button>
                )}
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No employees match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {panelTarget !== null && (
        <EmployeePanel target={panelTarget} onClose={() => setPanelTarget(null)} onChanged={load} />
      )}
    </Card>
  );
}
