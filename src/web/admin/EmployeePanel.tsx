import { useEffect, useState } from "react";
import { api } from "../api";
import { Button } from "../components/ui/Button";
import { Tag } from "../components/ui/Tag";
import { formatDate, tenure } from "../date";
import { formatINR } from "../money";
import { getSession } from "../session";
import { TeamManager } from "./TeamManager";
import { RoleManager } from "./RoleManager";
import type {
  Employee,
  EmployeeDetail,
  EmploymentType,
  LeaveRequest,
  Payroll,
  Reimbursement,
  Role,
  Team,
  WorkMode,
} from "../types";

interface FormState {
  name: string;
  email: string;
  location: string;
  work_mode: WorkMode;
  employment_type: EmploymentType;
  on_payroll: boolean;
  date_of_joining: string;
  salaryRupees: string;
  team_id: number | null;
  job_title: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  email: "",
  location: "",
  work_mode: "in-office",
  employment_type: "employee",
  on_payroll: true,
  date_of_joining: "",
  salaryRupees: "",
  team_id: null,
  job_title: "",
};

function toForm(e: Employee): FormState {
  return {
    name: e.name,
    email: e.email,
    location: e.location,
    work_mode: e.work_mode,
    employment_type: e.employment_type,
    on_payroll: e.on_payroll !== 0,
    date_of_joining: e.date_of_joining,
    salaryRupees: (e.monthly_salary / 100).toFixed(2),
    team_id: e.team_id,
    job_title: e.job_title,
  };
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
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [addingReimbursement, setAddingReimbursement] = useState(false);
  const [reimAmount, setReimAmount] = useState("");
  const [reimNote, setReimNote] = useState("");
  const [reimBusy, setReimBusy] = useState(false);
  const [removingReimId, setRemovingReimId] = useState<number | null>(null);

  const [teams, setTeams] = useState<Team[]>([]);
  const [showTeamManager, setShowTeamManager] = useState(false);

  const [roles, setRoles] = useState<Role[]>([]);
  const [showRoleManager, setShowRoleManager] = useState(false);

  const [tierBusy, setTierBusy] = useState(false);
  const viewerTier = getSession()?.tier;

  function loadTeams() {
    api.get<Team[]>("/admin/teams").then(setTeams).catch(() => {});
  }

  function loadRoles() {
    api.get<Role[]>("/admin/roles").then(setRoles).catch(() => {});
  }

  useEffect(loadTeams, []);
  useEffect(loadRoles, []);

  function loadDetail() {
    if (isNew) return;
    setLoading(true);
    api
      .get<EmployeeDetail>(`/admin/employees/${target}/detail`)
      .then((detail) => {
        setEmployee(detail.employee);
        setForm(toForm(detail.employee));
        setLeaves(detail.leaves);
        setPayroll(detail.payroll);
        setReimbursements(detail.reimbursements);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }

  useEffect(loadDetail, [target, isNew]);

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
      employment_type: form.employment_type,
      on_payroll: form.on_payroll,
      date_of_joining: form.date_of_joining,
      monthly_salary: Math.round((parseFloat(form.salaryRupees) || 0) * 100),
      team_id: form.team_id,
      job_title: form.job_title.trim(),
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

  async function changeTier(tier: "employee" | "hr") {
    if (!employee) return;
    setTierBusy(true);
    setError(null);
    try {
      const updated = await api.patch<Employee>(`/employees/${employee.id}/tier`, { tier });
      setEmployee(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update access");
    } finally {
      setTierBusy(false);
    }
  }

  async function removeReimbursement(id: number) {
    if (!window.confirm("Remove this reimbursement?")) return;
    setRemovingReimId(id);
    setError(null);
    try {
      await api.del(`/admin/reimbursements/${id}`);
      setReimbursements((rows) => rows.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove reimbursement");
    } finally {
      setRemovingReimId(null);
    }
  }

  async function addReimbursement() {
    const amountRupees = parseFloat(reimAmount);
    if (isNew || !amountRupees || amountRupees <= 0) {
      setError("Enter a reimbursement amount greater than 0");
      return;
    }
    setReimBusy(true);
    setError(null);
    try {
      await api.post(`/admin/employees/${target}/reimbursements`, {
        amount: Math.round(amountRupees * 100),
        note: reimNote.trim(),
      });
      setReimAmount("");
      setReimNote("");
      setAddingReimbursement(false);
      loadDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add reimbursement");
    } finally {
      setReimBusy(false);
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
              {!isNew && employee && viewerTier === "founder" && (
                <div className="field">
                  <label>Access level</label>
                  {employee.tier === "founder" ? (
                    <p className="field-hint">Founder — access level can't be changed here.</p>
                  ) : (
                    <select
                      value={employee.tier}
                      disabled={tierBusy}
                      onChange={(e) => changeTier(e.target.value as "employee" | "hr")}
                    >
                      <option value="employee">Employee</option>
                      <option value="hr">HR</option>
                    </select>
                  )}
                </div>
              )}
              <div className="field">
                <label>Address</label>
                <input type="text" value={form.location} onChange={(e) => set("location", e.target.value)} />
              </div>
              <div className="row">
                <div className="field">
                  <label>Work mode</label>
                  <select value={form.work_mode} onChange={(e) => set("work_mode", e.target.value as WorkMode)}>
                    <option value="in-office">In-office</option>
                    <option value="wfh">WFH / Online</option>
                  </select>
                </div>
                <div className="field">
                  <label>Employment type</label>
                  <select
                    value={form.employment_type}
                    onChange={(e) => set("employment_type", e.target.value as EmploymentType)}
                  >
                    <option value="employee">Employee</option>
                    <option value="freelancer">Freelancer</option>
                  </select>
                  {form.employment_type === "freelancer" && (
                    <p className="field-hint">Freelancers are excluded from attendance.</p>
                  )}
                </div>
              </div>
              <div className="field">
                <label>Date of joining</label>
                <input
                  type="date"
                  value={form.date_of_joining}
                  onChange={(e) => set("date_of_joining", e.target.value)}
                />
                {form.date_of_joining && <p className="field-hint">{tenure(form.date_of_joining)}</p>}
              </div>
              <div className="row">
                <div className="field">
                  <label>Team</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <select
                      value={form.team_id ?? ""}
                      onChange={(e) => set("team_id", e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">No team</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <Button type="button" onClick={() => setShowTeamManager(true)} title="Manage teams">
                      Manage
                    </Button>
                  </div>
                </div>
                <div className="field">
                  <label>Role</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <select value={form.job_title} onChange={(e) => set("job_title", e.target.value)}>
                      <option value="">No role</option>
                      {form.job_title && !roles.some((r) => r.name === form.job_title) && (
                        <option value={form.job_title}>{form.job_title}</option>
                      )}
                      {roles.map((r) => (
                        <option key={r.id} value={r.name}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <Button type="button" onClick={() => setShowRoleManager(true)} title="Manage roles">
                      Manage
                    </Button>
                  </div>
                </div>
              </div>
              <div className="field">
                <label>Monthly salary (INR)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.salaryRupees}
                  onChange={(e) => set("salaryRupees", e.target.value)}
                />
              </div>
              <div className="field">
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    checked={form.on_payroll}
                    onChange={(e) => set("on_payroll", e.target.checked)}
                    style={{ width: "auto" }}
                  />
                  Include in payroll
                </label>
              </div>

              {!isNew && (
                <>
                  <Button onClick={() => setAddingReimbursement((v) => !v)} disabled={busy}>
                    + Add reimbursement
                  </Button>

                  {addingReimbursement && (
                    <div className="inline-form">
                      <div className="row">
                        <div className="field">
                          <label>Amount (INR)</label>
                          <input
                            type="number"
                            step="0.01"
                            autoFocus
                            value={reimAmount}
                            onChange={(e) => setReimAmount(e.target.value)}
                          />
                        </div>
                        <div className="field">
                          <label>Note</label>
                          <input
                            type="text"
                            placeholder="Travel, meals, etc."
                            value={reimNote}
                            onChange={(e) => setReimNote(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="inline-form-actions">
                        <Button onClick={() => setAddingReimbursement(false)} disabled={reimBusy}>
                          Cancel
                        </Button>
                        <Button variant="primary" onClick={addReimbursement} disabled={reimBusy}>
                          {reimBusy ? "Adding…" : "Add"}
                        </Button>
                      </div>
                    </div>
                  )}

                  <h3 className="drawer-section">Reimbursements</h3>
                  {reimbursements.length === 0 ? (
                    <p className="muted">No reimbursements yet.</p>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Note</th>
                          <th>Amount</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {reimbursements.map((r) => (
                          <tr key={r.id}>
                            <td>{formatDate(r.created_at)}</td>
                            <td>{r.note || <span className="muted">—</span>}</td>
                            <td>{formatINR(r.amount)}</td>
                            <td>
                              <button
                                type="button"
                                className="row-remove-btn"
                                title="Remove reimbursement"
                                disabled={removingReimId === r.id}
                                onClick={() => removeReimbursement(r.id)}
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

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
                            <td>{formatINR(p.net_pay)}</td>
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

      {showTeamManager && (
        <TeamManager
          teams={teams}
          onClose={() => setShowTeamManager(false)}
          onChanged={loadTeams}
        />
      )}

      {showRoleManager && (
        <RoleManager
          roles={roles}
          onClose={() => setShowRoleManager(false)}
          onChanged={loadRoles}
        />
      )}
    </>
  );
}
