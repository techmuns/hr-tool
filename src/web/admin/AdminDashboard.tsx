import { useState } from "react";
import { Nav } from "../components/Nav";
import { Button } from "../components/ui/Button";
import { ThemeToggle } from "../components/ThemeToggle";
import { AttendanceTable } from "./AttendanceTable";
import { Payroll } from "./Payroll";
import { LeaveRequests } from "./LeaveRequests";
import { FeedbackList } from "./FeedbackList";
import { AdminChat } from "./AdminChat";

const VIEWS = [
  { key: "attendance", label: "Attendance" },
  { key: "payroll", label: "Payroll" },
  { key: "leave", label: "Leave Requests" },
  { key: "feedback", label: "Feedback" },
  { key: "chat", label: "Chat" },
];

export function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [view, setView] = useState("attendance");

  return (
    <div className="app-shell">
      <div className="topbar">
        <h1>HR Tool — Admin</h1>
        <div className="topbar-actions">
          <span className="who">HR view</span>
          <ThemeToggle />
          <Button onClick={onLogout}>Log out</Button>
        </div>
      </div>
      <div className="layout">
        <Nav items={VIEWS} active={view} onSelect={setView} />
        <div className="content">
          {view === "attendance" && <AttendanceTable />}
          {view === "payroll" && <Payroll />}
          {view === "leave" && <LeaveRequests />}
          {view === "feedback" && <FeedbackList />}
          {view === "chat" && <AdminChat />}
        </div>
      </div>
    </div>
  );
}
