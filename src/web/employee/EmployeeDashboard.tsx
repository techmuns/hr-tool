import { useState } from "react";
import { Nav } from "../components/Nav";
import { Button } from "../components/ui/Button";
import { ThemeToggle } from "../components/ThemeToggle";
import { ClockCard } from "./ClockCard";
import { WorkingDays } from "./WorkingDays";
import { Profile } from "./Profile";
import { LeaveForm } from "./LeaveForm";
import { ReimbursementRequest } from "./ReimbursementRequest";
import { FeedbackForm } from "./FeedbackForm";
import { Chat } from "./Chat";

const VIEWS = [
  { key: "home", label: "Home" },
  { key: "feedback", label: "Feedback" },
  { key: "chat", label: "Chat with HR" },
];

export function EmployeeDashboard({ onLogout }: { onLogout?: () => void }) {
  const [view, setView] = useState("home");
  const [attendanceRefresh, setAttendanceRefresh] = useState(0);

  return (
    <div className="app-shell">
      <div className="topbar">
        <h1>HR Tool — Employee</h1>
        <div className="topbar-actions">
          <span className="who">Employee view</span>
          <ThemeToggle />
          {onLogout && <Button onClick={onLogout}>Log out</Button>}
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
