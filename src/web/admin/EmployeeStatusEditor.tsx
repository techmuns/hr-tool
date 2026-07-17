import { useEffect, useState } from "react";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { todayISODate } from "../date";
import type { Employee, WorkMode } from "../types";

export function EmployeeStatusEditor() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .get<Employee[]>("/employees")
      .then(setEmployees)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }

  useEffect(load, []);

  async function updateEmployee(id: number, patch: Partial<Pick<Employee, "work_mode" | "date_of_joining">>) {
    setSavingId(id);
    setError(null);
    try {
      const updated = await api.patch<Employee>(`/employees/${id}`, patch);
      setEmployees((prev) => prev.map((e) => (e.id === id ? updated : e)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSavingId(null);
    }
  }

  async function markAttendance(employeeId: number, status: "present" | "absent") {
    setSavingId(employeeId);
    setError(null);
    try {
      await api.post("/admin/attendance", { employee_id: employeeId, work_date: todayISODate(), status });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update attendance");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Card title="Employee Status">
      {error && <p className="error-text">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th>Work Mode</th>
            <th>Date of Joining</th>
            <th>Today's Attendance</th>
          </tr>
        </thead>
        <tbody>
          {employees
            .filter((e) => e.role === "employee")
            .map((emp) => (
              <tr key={emp.id}>
                <td>{emp.name}</td>
                <td>
                  <select
                    value={emp.work_mode}
                    disabled={savingId === emp.id}
                    onChange={(e) => updateEmployee(emp.id, { work_mode: e.target.value as WorkMode })}
                    style={{ width: "auto" }}
                  >
                    <option value="in-office">In-office</option>
                    <option value="wfh">WFH</option>
                  </select>
                </td>
                <td>
                  <input
                    type="date"
                    value={emp.date_of_joining}
                    disabled={savingId === emp.id}
                    onChange={(e) => updateEmployee(emp.id, { date_of_joining: e.target.value })}
                    style={{ width: "auto" }}
                  />
                </td>
                <td style={{ display: "flex", gap: 8 }}>
                  <Button
                    disabled={savingId === emp.id}
                    onClick={() => markAttendance(emp.id, "present")}
                  >
                    Mark Present
                  </Button>
                  <Button
                    variant="danger"
                    disabled={savingId === emp.id}
                    onClick={() => markAttendance(emp.id, "absent")}
                  >
                    Mark Absent
                  </Button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </Card>
  );
}
