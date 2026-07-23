import { useEffect, useState } from "react";
import { Nav } from "../components/Nav";
import { ThemeToggle } from "../components/ThemeToggle";
import { ClockCard } from "./ClockCard";
import { WorkingDays } from "./WorkingDays";
import { Profile } from "./Profile";
import { LeaveForm } from "./LeaveForm";
import { ReimbursementRequest } from "./ReimbursementRequest";
import { FeedbackForm } from "./FeedbackForm";
import { Chat } from "./Chat";
import { api } from "../api";
import type { EmployeeWithTeam } from "../types";

const VIEWS = [
  { key: "home", label: "Home" },
  { key: "feedback", label: "Feedback" },
  { key: "chat", label: "Chat with HR" },
];

export function EmployeeDashboard() {
  const [view, setView] = useState("home");
  const [attendanceRefresh, setAttendanceRefresh] = useState(0);
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
          {view === "home" && (
            <>
              <ClockCard onChange={() => setAttendanceRefresh((n) => n + 1)} />
              <WorkingDays refreshSignal={attendanceRefresh} />
              <Profile />
              <LeaveForm onMarked={() => setAttendanceRefresh((n) => n + 1)} />
              <ReimbursementRequest />
            </>
          )}
          {view === "feedback" && <FeedbackForm />}
          {view === "chat" && <Chat />}
        </div>
      </div>
    </div>
  );
}
