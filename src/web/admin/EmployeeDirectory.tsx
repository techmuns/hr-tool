import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Tag } from "../components/ui/Tag";
import { formatDate } from "../date";
import { EmployeePanel } from "./EmployeePanel";
import type { EmployeeWithTeam, Team, WorkMode } from "../types";

const WORK_MODE_LABEL: Record<WorkMode, string> = {
  "in-office": "In-office",
  wfh: "WFH / Online",
};

export function EmployeeDirectory() {
  const [employees, setEmployees] = useState<EmployeeWithTeam[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [panelTarget, setPanelTarget] = useState<number | "new" | null>(null);

  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [workModeFilter, setWorkModeFilter] = useState("");

  function load() {
    Promise.all([api.get<EmployeeWithTeam[]>("/employees"), api.get<Team[]>("/admin/teams")])
      .then(([emps, tms]) => {
        setEmployees(emps);
        setTeams(tms);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }

  useEffect(load, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (teamFilter && String(e.team_id ?? "") !== teamFilter) return false;
      if (workModeFilter && e.work_mode !== workModeFilter) return false;
      if (q) {
        const haystack = `${e.name} ${e.email} ${e.job_title} ${e.team_name ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [employees, search, teamFilter, workModeFilter]);

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
            placeholder="Name, email, role, team…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Team</label>
          <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Employee type</label>
          <select value={workModeFilter} onChange={(e) => setWorkModeFilter(e.target.value)}>
            <option value="">All types</option>
            <option value="in-office">In-office</option>
            <option value="wfh">WFH / Online</option>
          </select>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Team</th>
            <th>Email</th>
            <th>Role</th>
            <th>Access</th>
            <th>Type</th>
            <th>Joined</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((emp) => (
            <tr key={emp.id}>
              <td>
                <button type="button" className="hm-name-btn" onClick={() => setPanelTarget(emp.id)}>
                  {emp.name}
                </button>
              </td>
              <td>{emp.team_name || <span className="muted">—</span>}</td>
              <td>{emp.email || <span className="muted">—</span>}</td>
              <td>{emp.job_title || <span className="muted">—</span>}</td>
              <td>{emp.tier === "employee" ? <span className="muted">—</span> : <Tag value={emp.tier} />}</td>
              <td>{WORK_MODE_LABEL[emp.work_mode]}</td>
              <td>{formatDate(emp.date_of_joining)}</td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">
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
