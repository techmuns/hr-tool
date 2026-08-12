import { useState, type ReactNode } from "react";
import { Nav } from "../components/Nav";
import { ThemeToggle } from "../components/ThemeToggle";
import { AttendanceTable } from "./AttendanceTable";
import { Payroll } from "./Payroll";
import { ReimbursementNotes } from "./ReimbursementNotes";
import { Certificates } from "./Certificates";
import { FeedbackList } from "./FeedbackList";
import { AdminChat } from "./AdminChat";
import { EmployeeDirectory } from "./EmployeeDirectory";
import { ArchivedEmployees } from "./ArchivedEmployees";
import { ClockCard } from "../employee/ClockCard";
import { WorkingDays } from "../employee/WorkingDays";
import { getSession } from "../session";

/**
 * `topbarExtra` is the view switcher AdminArea (App.tsx) drops into the topbar
 * so an admin can flip into the employee-screen preview and back. When it's
 * absent the topbar falls back to the plain "Founder view"/"HR view" label.
 */
export function AdminDashboard({ topbarExtra }: { topbarExtra?: ReactNode }) {
  const tier = getSession()?.tier;
  const isHR = tier === "hr";
  const isFounder = tier === "founder";

  // HR clocks in (and only HR); founders don't. Founders see feedback (and only
  // founders); HR doesn't.
  const views = [
    ...(isHR ? [{ key: "home", label: "My attendance" }] : []),
    { key: "attendance", label: "Attendance" },
    { key: "employees", label: "Employees" },
    { key: "archived", label: "Archived" },
    // Payroll covers payslips and the adjustments that feed them — one cycle,
    // one screen, so an approval and the net pay it moves stay side by side.
    { key: "payroll", label: "Payroll" },
    // HR keeps the daily reimbursement notepad; founders only view it on Payroll.
    ...(isHR ? [{ key: "reimb-notes", label: "Reimb. Notes" }] : []),
    { key: "certificates", label: "Certificates" },
    ...(isFounder ? [{ key: "feedback", label: "Feedback" }] : []),
    { key: "chat", label: "Chat" },
  ];

  const [view, setView] = useState(isHR ? "home" : "attendance");
  const [attendanceRefresh, setAttendanceRefresh] = useState(0);
  // Set when "Remove employee" offers to send a leaving certificate first —
  // switches to this tab with that person already selected in the form.
  const [certificatePreset, setCertificatePreset] = useState<number | null>(null);

  function goToCertificates(employeeId: number) {
    setCertificatePreset(employeeId);
    setView("certificates");
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <h1>HR Tool — Admin</h1>
        <div className="topbar-actions">
          {topbarExtra ?? (
            <span className="who">{tier === "founder" ? "Founder view" : "HR view"}</span>
          )}
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
          {view === "attendance" && <AttendanceTable onGoToCertificates={goToCertificates} />}
          {view === "employees" && <EmployeeDirectory onGoToCertificates={goToCertificates} />}
          {view === "archived" && <ArchivedEmployees onGoToCertificates={goToCertificates} />}
          {view === "payroll" && <Payroll />}
          {isHR && view === "reimb-notes" && <ReimbursementNotes />}
          {view === "certificates" && (
            <Certificates
              presetEmployeeId={certificatePreset}
              onConsumedPreset={() => setCertificatePreset(null)}
            />
          )}
          {isFounder && view === "feedback" && <FeedbackList />}
          {view === "chat" && <AdminChat />}
        </div>
      </div>
    </div>
  );
}
