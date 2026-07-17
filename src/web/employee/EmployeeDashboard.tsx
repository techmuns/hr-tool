import { useState } from "react";
import { Nav } from "../components/Nav";
import { Button } from "../components/ui/Button";
import { ClockCard } from "./ClockCard";
import { WorkingDays } from "./WorkingDays";
import { Profile } from "./Profile";
import { LeaveForm } from "./LeaveForm";
import { FeedbackForm } from "./FeedbackForm";
import { Chat } from "./Chat";

const VIEWS = [
  { key: "attendance", label: "Attendance" },
  { key: "profile", label: "Profile" },
  { key: "leave", label: "Apply for Leave" },
  { key: "feedback", label: "Feedback" },
  { key: "chat", label: "Chat with HR" },
];

export function EmployeeDashboard({ onLogout }: { onLogout: () => void }) {
  const [view, setView] = useState("attendance");

  return (
    <div className="app-shell">
      <div className="topbar">
        <h1>HR Tool — Employee</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="who">Employee view</span>
          <Button onClick={onLogout}>Log out</Button>
        </div>
      </div>
      <div className="layout">
        <Nav items={VIEWS} active={view} onSelect={setView} />
        <div className="content">
          {view === "attendance" && (
            <>
              <ClockCard />
              <WorkingDays />
            </>
          )}
          {view === "profile" && <Profile />}
          {view === "leave" && <LeaveForm />}
          {view === "feedback" && <FeedbackForm />}
          {view === "chat" && <Chat />}
        </div>
      </div>
    </div>
  );
}
