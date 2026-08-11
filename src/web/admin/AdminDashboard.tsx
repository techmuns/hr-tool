import { useState } from "react";
import { Nav } from "../components/Nav";
import { ThemeToggle } from "../components/ThemeToggle";
import { AttendanceTable } from "./AttendanceTable";
import { Payroll } from "./Payroll";
import { Certificates } from "./Certificates";
import { FeedbackList } from "./FeedbackList";
import { AdminChat } from "./AdminChat";
import { EmployeeDirectory } from "./EmployeeDirectory";
import { ClockCard } from "../employee/ClockCard";
import { WorkingDays } from "../employee/WorkingDays";
import { Profile } from "../employee/Profile";
import { LeaveForm } from "../employee/LeaveForm";
import { ReimbursementRequest } from "../employee/ReimbursementRequest";
import { Payslips } from "../employee/Payslips";
import { getSession } from "../session";

export function AdminDashboard() {
  const tier = getSession()?.tier;
  const isHR = tier === "hr";
  const isFounder = tier === "founder";

  // The self-service "Employee view" — clock in/out, own attendance, profile,
  // leave, reimbursements and payslips — is available to both HR and founders
  // now, so an admin can use the app as an employee too (it supersedes the old
  // HR-only "My attendance" tab, which only had the clock and working days).
  // Founders see feedback (and only founders); HR doesn't.
  const views = [
    { key: "me", label: "Employee view" },
    { key: "attendance", label: "Attendance" },
    { key: "employees", label: "Employees" },
    // Payroll covers payslips and the adjustments that feed them — one cycle,
    // one screen, so an approval and the net pay it moves stay side by side.
    { key: "payroll", label: "Payroll" },
    { key: "certificates", label: "Certificates" },
    ...(isFounder ? [{ key: "feedback", label: "Feedback" }] : []),
    { key: "chat", label: "Chat" },
  ];

  // HR lands on their own Employee view (as before); founders keep landing on
  // the org-wide Attendance grid they manage.
  const [view, setView] = useState(isHR ? "me" : "attendance");
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
          <span className="who">{tier === "founder" ? "Founder view" : "HR view"}</span>
          <ThemeToggle />
        </div>
      </div>
      <div className="layout">
        <Nav items={views} active={view} onSelect={setView} />
        <div className="content">
          {view === "me" && (
            <>
              <ClockCard onChange={() => setAttendanceRefresh((n) => n + 1)} />
              <WorkingDays refreshSignal={attendanceRefresh} />
              <Profile />
              <LeaveForm onMarked={() => setAttendanceRefresh((n) => n + 1)} />
              <ReimbursementRequest />
              <Payslips />
            </>
          )}
          {view === "attendance" && <AttendanceTable onGoToCertificates={goToCertificates} />}
          {view === "employees" && <EmployeeDirectory onGoToCertificates={goToCertificates} />}
          {view === "payroll" && <Payroll />}
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
