import { useEffect, useState } from "react";
import { api } from "../api";
import { Button } from "../components/ui/Button";
import { Tag } from "../components/ui/Tag";
import { formatDate } from "../date";
import type { Employee, EmployeeDetail, LeaveRequest, Payroll, WorkMode } from "../types";

interface FormState {
  name: string;
  email: string;
  location: string;
  work_mode: WorkMode;
  date_of_joining: string;
  salaryDollars: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  email: "",
  location: "",
  work_mode: "in-office",
  date_of_joining: "",
  salaryDollars: "",
};

function toForm(e: Employee): FormState {
  return {
    name: e.name,
    email: e.email,
    location: e.location,
    work_mode: e.work_mode,
    date_of_joining: e.date_of_joining,
    salaryDollars: (e.monthly_salary / 100).toFixed(2),
  };
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function EmployeePanel({
  target,
  onClose,
  onChanged,
}: {
  target: number | "new";
  onClose: () => void;
  onChanged: () => void;
}) {
  const isNew = target === "new";
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [payroll, setPayroll] = useState<Payroll[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    setLoading(true);
    api
      .get<EmployeeDetail>(`/admin/employees/${target}/detail`)
      .then((detail) => {
        setEmployee(detail.employee);
        setForm(toForm(detail.employee));
        setLeaves(detail.leaves);
        setPayroll(detail.payroll);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [target, isNew]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      location: form.location.trim(),
      work_mode: form.work_mode,
      date_of_joining: form.date_of_joining,
      monthly_salary: Math.round((parseFloat(form.salaryDollars) || 0) * 100),
    };
    try {
      if (isNew) {
        await api.post("/employees", payload);
      } else {
        await api.patch(`/employees/${target}`, payload);
      }
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (isNew || !employee) return;
    if (!window.confirm(`Remove ${employee.name}? This deletes their attendance, leaves and payroll too.`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.del(`/employees/${target}`);
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={busy ? undefined : onClose} />
      <aside className="drawer" role="dialog" aria-label="Employee details">
        <div className="drawer-head">
          <h2>{isNew ? "Add employee" : employee?.name ?? "Employee"}</h2>
          <button className="btn icon-btn" onClick={onClose} aria-label="Close" disabled={busy}>
            ✕
          </button>
        </div>

        <div className="drawer-body">
          {error && <p className="error-text">{error}</p>}
          {loading ? (
            <p className="muted">Loading…</p>
          ) : (
            <>
              <div className="field">
                <label>Name</label>
                <input type="text" value={form.name} onChange={(e) => set("name", e.target.value)} />
              </div>
              <div className="field">
                <label>Email</label>
                <input type="text" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </div>
              <div className="field">
                <label>Address</label>
                <input type="text" value={form.location} onChange={(e) => set("location", e.target.value)} />
              </div>
              <div className="row">
                <div className="field">
                  <label>Employee type</label>
                  <select value={form.work_mode} onChange={(e) => set("work_mode", e.target.value as WorkMode)}>
                    <option value="in-office">In-office</option>
                    <option value="wfh">WFH / Online</option>
                  </select>
                </div>
                <div className="field">
                  <label>Date of joining</label>
                  <input
                    type="date"
                    value={form.date_of_joining}
                    onChange={(e) => set("date_of_joining", e.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <label>Monthly salary (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.salaryDollars}
                  onChange={(e) => set("salaryDollars", e.target.value)}
                />
              </div>

              {!isNew && (
                <>
                  <h3 className="drawer-section">Leaves</h3>
                  {leaves.length === 0 ? (
                    <p className="muted">No leave requests.</p>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Dates</th>
                          <th>Type</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leaves.map((l) => (
                          <tr key={l.id}>
                            <td>
                              {formatDate(l.start_date)} – {formatDate(l.end_date)}
                            </td>
                            <td>
                              <Tag value={l.leave_type} />
                            </td>
                            <td>
                              <Tag value={l.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  <h3 className="drawer-section">Payroll</h3>
                  {payroll.length === 0 ? (
                    <p className="muted">No payroll generated yet.</p>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Period</th>
                          <th>Net pay</th>
                          <th>Unpaid days</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payroll.map((p) => (
                          <tr key={p.id}>
                            <td>{p.period}</td>
                            <td>{money(p.net_pay)}</td>
                            <td>{p.unpaid_days}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div className="drawer-foot">
          {!isNew && (
            <Button variant="danger" onClick={remove} disabled={busy || loading}>
              Remove
            </Button>
          )}
          <div className="drawer-foot-right">
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} disabled={busy || loading}>
              {busy ? "Saving…" : isNew ? "Add employee" : "Save changes"}
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}
