export type WorkMode = "wfh" | "in-office";
export type EmployeeRole = "employee" | "admin";
export type AttendanceStatus = "present" | "absent" | "leave";
export type LeaveType = "paid" | "unpaid";
export type LeaveStatus = "pending" | "approved" | "rejected";
export type SenderRole = "employee" | "admin";

export interface Employee {
  id: number;
  name: string;
  email: string;
  location: string;
  work_mode: WorkMode;
  date_of_joining: string;
  role: EmployeeRole;
  monthly_salary: number;
  created_at: string;
  team_id: number | null;
  job_title: string;
}

export interface EmployeeWithTeam extends Employee {
  team_name: string | null;
}

export interface EmployeeDetail {
  employee: Employee;
  leaves: LeaveRequest[];
  payroll: Payroll[];
  reimbursements: Reimbursement[];
}

export interface Team {
  id: number;
  name: string;
  created_at: string;
}

export interface Reimbursement {
  id: number;
  employee_id: number;
  amount: number;
  note: string;
  created_at: string;
}

export interface Attendance {
  id: number;
  employee_id: number;
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  status: AttendanceStatus;
}

export interface AttendanceWithName extends Attendance {
  employee_name: string;
}

export interface LeaveRequest {
  id: number;
  employee_id: number;
  start_date: string;
  end_date: string;
  leave_type: LeaveType;
  reason: string;
  status: LeaveStatus;
  created_at: string;
}

export interface LeaveRequestWithName extends LeaveRequest {
  employee_name: string;
}

export interface Feedback {
  id: number;
  employee_id: number;
  message: string;
  created_at: string;
}

export interface FeedbackWithName extends Feedback {
  employee_name: string;
}

export interface ChatMessage {
  id: number;
  employee_id: number;
  sender_role: SenderRole;
  body: string;
  created_at: string;
}

export interface Payroll {
  id: number;
  employee_id: number;
  period: string;
  base_salary: number;
  paid_days: number;
  unpaid_days: number;
  deductions: number;
  reimbursements: number;
  net_pay: number;
  generated_at: string;
}

export interface PayrollWithName extends Payroll {
  employee_name: string;
}
