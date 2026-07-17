import { useEffect, useState } from "react";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { formatDate } from "../date";
import type { Employee } from "../types";

export function Profile() {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Employee>("/me")
      .then((emp) => {
        setEmployee(emp);
        setName(emp.name);
        setLocation(emp.location);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const updated = await api.patch<Employee>("/me", { name, location });
      setEmployee(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!employee) return <Card title="Profile">{error ? <p className="error-text">{error}</p> : "Loading…"}</Card>;

  return (
    <Card title="Profile">
      <form onSubmit={save}>
        <div className="row">
          <div className="field">
            <label>Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>Location</label>
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label>Work Mode</label>
            <input type="text" value={employee.work_mode} disabled />
          </div>
          <div className="field">
            <label>Date of Joining</label>
            <input type="text" value={formatDate(employee.date_of_joining)} disabled />
          </div>
        </div>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        {saved && <span className="muted" style={{ marginLeft: 10 }}>Saved.</span>}
        {error && <p className="error-text">{error}</p>}
      </form>
    </Card>
  );
}
