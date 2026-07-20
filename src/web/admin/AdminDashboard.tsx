import { useState } from "react";
import { Nav } from "../components/Nav";
import { Button } from "../components/ui/Button";
import { ThemeToggle } from "../components/ThemeToggle";
import { AttendanceTable } from "./AttendanceTable";
import { Payroll } from "./Payroll";
import { FeedbackList } from "./FeedbackList";
import { AdminChat } from "./AdminChat";
import { EmployeeDirectory } from "./EmployeeDirectory";

const ALL_VIEWS = [
  { key: "attendance", label: "Attendance" },
  { key: "employees", label: "Employees" },
  { key: "payroll", label: "Payroll" },
  { key: "feedback", label: "Feedback" },
  { key: "chat", label: "Chat" },
];

const WHO_LABEL = { hr: "HR view", founder: "Founder view" };

export function AdminDashboard({
  onLogout,
  tier,
  showFeedback,
}: {
  onLogout?: () => void;
  tier: "hr" | "founder";
  showFeedback: boolean;
}) {
  const [view, setView] = useState("attendance");
  const views = showFeedback ? ALL_VIEWS : ALL_VIEWS.filter((v) => v.key !== "feedback");

  return (
    <div className="app-shell">
      <div className="topbar">
        <h1>HR Tool — Admin</h1>
        <div className="topbar-actions">
          <span className="who">{WHO_LABEL[tier]}</span>
          <ThemeToggle />
          {onLogout && <Button onClick={onLogout}>Log out</Button>}
        </div>
      </div>
      <div className="layout">
        <Nav items={views} active={view} onSelect={setView} />
        <div className="content">
          {view === "attendance" && <AttendanceTable />}
          {view === "employees" && <EmployeeDirectory />}
          {view === "payroll" && <Payroll />}
          {showFeedback && view === "feedback" && <FeedbackList />}
          {view === "chat" && <AdminChat />}
        </div>
      </div>
    </div>
  );
}
