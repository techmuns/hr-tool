import { useState } from "react";
import { Nav } from "../components/Nav";
import { Button } from "../components/ui/Button";
import { ThemeToggle } from "../components/ThemeToggle";
import { AttendanceTable } from "./AttendanceTable";
import { Payroll } from "./Payroll";
import { FeedbackList } from "./FeedbackList";
import { AdminChat } from "./AdminChat";
import { EmployeeDirectory } from "./EmployeeDirectory";
import { getSession } from "../session";

const VIEWS = [
  { key: "attendance", label: "Attendance" },
  { key: "employees", label: "Employees" },
  { key: "payroll", label: "Payroll" },
  { key: "feedback", label: "Feedback" },
  { key: "chat", label: "Chat" },
];

export function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [view, setView] = useState("attendance");
  const tier = getSession()?.tier;

  return (
    <div className="app-shell">
      <div className="topbar">
        <h1>HR Tool — Admin</h1>
        <div className="topbar-actions">
          <span className="who">{tier === "founder" ? "Founder view" : "HR view"}</span>
          <ThemeToggle />
          <Button onClick={onLogout}>Log out</Button>
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
