import { useState } from "react";
import { Nav } from "../components/Nav";
import { ThemeToggle } from "../components/ThemeToggle";
import { AttendanceTable } from "./AttendanceTable";
import { Payroll } from "./Payroll";
import { Adjustments } from "./Adjustments";
import { FeedbackList } from "./FeedbackList";
import { AdminChat } from "./AdminChat";
import { EmployeeDirectory } from "./EmployeeDirectory";
import { ClockCard } from "../employee/ClockCard";
import { WorkingDays } from "../employee/WorkingDays";
import { getSession } from "../session";

export function AdminDashboard() {
  const tier = getSession()?.tier;
  const isHR = tier === "hr";
  const isFounder = tier === "founder";

  // HR clocks in (and only HR); founders don't. Founders see feedback (and only
  // founders); HR doesn't.
  const views = [
    ...(isHR ? [{ key: "home", label: "My attendance" }] : []),
    { key: "attendance", label: "Attendance" },
    { key: "employees", label: "Employees" },
    { key: "payroll", label: "Payroll" },
    { key: "adjustments", label: "Adjustments" },
    ...(isFounder ? [{ key: "feedback", label: "Feedback" }] : []),
    { key: "chat", label: "Chat" },
  ];

  const [view, setView] = useState(isHR ? "home" : "attendance");
  const [attendanceRefresh, setAttendanceRefresh] = useState(0);

  return (
    <div className="app-shell">
      <div className="topbar">
        <h1>HR Tool — Admin</h1>
        <div className="topbar-actions">
          <span className="who">{tier === "founder" ? "Founder view" : "HR view"}</span>
          <ThemeToggle />
        </div>
      </div>
      <div className="layout">
        <Nav items={views} active={view} onSelect={setView} />
        <div className="content">
          {isHR && view === "home" && (
            <>
              <ClockCard onChange={() => setAttendanceRefresh((n) => n + 1)} />
              <WorkingDays refreshSignal={attendanceRefresh} />
            </>
          )}
          {view === "attendance" && <AttendanceTable />}
          {view === "employees" && <EmployeeDirectory />}
          {view === "payroll" && <Payroll />}
          {view === "adjustments" && <Adjustments />}
          {isFounder && view === "feedback" && <FeedbackList />}
          {view === "chat" && <AdminChat />}
        </div>
      </div>
    </div>
  );
}
