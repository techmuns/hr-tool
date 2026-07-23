import { useEffect, useState } from "react";
import { Nav } from "../components/Nav";
import { ThemeToggle } from "../components/ThemeToggle";
import { AttendanceTable } from "./AttendanceTable";
import { Payroll } from "./Payroll";
import { FeedbackList } from "./FeedbackList";
import { AdminChat } from "./AdminChat";
import { EmployeeDirectory } from "./EmployeeDirectory";
import { api } from "../api";
import type { EmployeeWithTeam } from "../types";

const VIEWS = [
  { key: "attendance", label: "Attendance" },
  { key: "employees", label: "Employees" },
  { key: "payroll", label: "Payroll" },
  { key: "feedback", label: "Feedback" },
  { key: "chat", label: "Chat" },
];

export function AdminDashboard() {
  const [view, setView] = useState("attendance");
  const [employee, setEmployee] = useState<EmployeeWithTeam | null>(null);

  useEffect(() => {
    api.get<EmployeeWithTeam>("/me").then(setEmployee).catch(() => setEmployee(null));
  }, []);

  return (
    <div className="app-shell">
      <div className="topbar">
        <h1>HR Tool</h1>
        <div className="topbar-actions">
          {employee && (
            <span className="who">
              {employee.name}
              {employee.job_title ? ` · ${employee.job_title}` : ""}
            </span>
          )}
          <ThemeToggle />
        </div>
      </div>
      <div className="layout">
        <Nav items={VIEWS} active={view} onSelect={setView} />
        <div className="content">
          {view === "attendance" && <AttendanceTable />}
          {view === "employees" && <EmployeeDirectory />}
          {view === "payroll" && <Payroll />}
          {view === "feedback" && <FeedbackList />}
          {view === "chat" && <AdminChat />}
        </div>
      </div>
    </div>
  );
}
