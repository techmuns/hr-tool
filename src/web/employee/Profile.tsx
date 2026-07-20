import { useEffect, useState } from "react";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import { formatDate, tenure } from "../date";
import { formatINR } from "../money";
import type { EmployeeWithTeam, WorkMode } from "../types";

const WORK_MODE_LABEL: Record<WorkMode, string> = {
  "in-office": "In-office",
  wfh: "WFH / Online",
};

export function Profile() {
  const [employee, setEmployee] = useState<EmployeeWithTeam | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<EmployeeWithTeam>("/me")
      .then(setEmployee)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, []);

  if (!employee) return <Card title="Profile">{error ? <p className="error-text">{error}</p> : "Loading…"}</Card>;

  return (
    <Card title="Profile">
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Your profile is managed by HR — contact them to update any of this.
      </p>
      <div className="row">
        <div className="field">
          <label>Name</label>
          <input type="text" value={employee.name} disabled />
        </div>
        <div className="field">
          <label>Email</label>
          <input type="text" value={employee.email || "—"} disabled />
        </div>
      </div>
      <div className="field">
        <label>Address</label>
        <input type="text" value={employee.location || "—"} disabled />
      </div>
      <div className="row">
        <div className="field">
          <label>Employee type</label>
          <input type="text" value={WORK_MODE_LABEL[employee.work_mode]} disabled />
        </div>
        <div className="field">
          <label>Date of joining</label>
          <input type="text" value={formatDate(employee.date_of_joining)} disabled />
          <p className="field-hint">{tenure(employee.date_of_joining)}</p>
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label>Team</label>
          <input type="text" value={employee.team_name || "No team"} disabled />
        </div>
        <div className="field">
          <label>Role</label>
          <input type="text" value={employee.job_title || "—"} disabled />
        </div>
      </div>
      <div className="field">
        <label>Monthly salary (INR)</label>
        <input type="text" value={formatINR(employee.monthly_salary)} disabled />
      </div>
    </Card>
  );
}
