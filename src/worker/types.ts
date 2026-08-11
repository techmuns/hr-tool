export type WorkMode = "wfh" | "in-office" | "hybrid";
export type EmployeeRole = "employee" | "admin";
export type Tier = "employee" | "hr" | "founder";
export type EmploymentType = "employee" | "freelancer" | "intern";
export type AttendanceStatus = "present" | "absent" | "leave";
export type LeaveType = "paid" | "unpaid";
export type LeaveStatus = "pending" | "approved" | "rejected";
/** Where a reimbursement sits in the HR approval queue. */
export type ReimbursementStatus = "pending" | "approved" | "rejected";
export type SenderRole = "employee" | "admin";

export interface Employee {
  id: number;
  name: string;
  email: string;
  location: string;
  work_mode: WorkMode;
  date_of_joining: string;
  role: EmployeeRole;
  tier: Tier;
  employment_type: EmploymentType;
  on_payroll: number; // 0 | 1
  on_attendance: number; // 0 | 1
  monthly_salary: number;
  created_at: string;
  /**
   * Teams were removed from the product; designation (job_title) is the only
   * grouping now. The column still exists so no data is destroyed, but nothing
   * reads or writes it.
   */
  team_id: number | null;
  job_title: string;
  /** UTC date ("YYYY-MM-DD") we last emailed a clock-in reminder, or null. */
  last_attendance_reminder_at: string | null;
  /** How that reminder was sent: 'auto' (weekday cron) or 'manual' (HR). */
  last_attendance_reminder_kind: "auto" | "manual" | null;
}

export interface EmployeeDetail {
  employee: Employee;
  leaves: LeaveRequest[];
  payroll: Payroll[];
  reimbursements: Reimbursement[];
}

export interface Role {
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
  /** R2 object key for the attached bill; null when none was uploaded. */
  bill_key: string | null;
  bill_name: string | null;
  bill_type: string | null;
  bill_size: number | null;
  /** Only 'approved' rows are counted into a cycle's pay. */
  status: ReimbursementStatus;
  /** When HR decided; null while still pending. */
  decided_at: string | null;
  decided_by: number | null;
  /** Optional reason HR typed alongside the decision — mainly for rejections. */
  decision_note: string;
}

export interface ReimbursementWithName extends Reimbursement {
  employee_name: string;
  /** Who approved or rejected it; null while pending (or if they've since left). */
  decided_by_name: string | null;
}

/** A deduction HR books by hand against a cycle, on top of any leave deduction. */
export interface Deduction {
  id: number;
  employee_id: number;
  /** The payroll period ("YYYY-MM") this is charged to. */
  period: string;
  amount: number;
  note: string;
  created_at: string;
  created_by: number | null;
}

export interface DeductionWithName extends Deduction {
  employee_name: string;
  created_by_name: string | null;
}

/** What unpaid leave costs one employee in a cycle — derived, never stored here. */
export interface LeaveDeduction {
  employee_id: number;
  employee_name: string;
  monthly_salary: number;
  unpaid_days: number;
  amount: number;
}

/**
 * Everything the Adjustments tab shows for one cycle. `pending` is deliberately
 * not date-filtered: a request waiting on HR needs deciding whenever it was
 * filed, and hiding it because it predates the selected cycle would strand it.
 */
export interface CycleAdjustments {
  period: string;
  cycle: { start: string; end: string; payDate: string };
  pending: ReimbursementWithName[];
  /** Decided reimbursements filed inside this cycle. */
  reimbursements: ReimbursementWithName[];
  deductions: DeductionWithName[];
  leave: LeaveDeduction[];
  /**
   * True once the cycle's dues are marked paid. Payroll figures track their
   * inputs automatically right up until that point, then freeze.
   */
  paid: boolean;
}

export interface Attendance {
  id: number;
  employee_id: number;
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  status: AttendanceStatus;
  /** 1 when a present day was worked in-office rather than remotely. 0 | 1. */
  in_office: number;
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
  anonymous: number; // 0 | 1
  created_at: string;
}

export interface FeedbackWithName extends Feedback {
  employee_name: string | null; // null when sent anonymously
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
  /** Total netted off the salary — the sum of the two breakdown columns below. */
  deductions: number;
  /** The unpaid-leave share of `deductions`. */
  leave_deductions: number;
  /** The manually-booked share of `deductions`. */
  other_deductions: number;
  reimbursements: number;
  net_pay: number;
  generated_at: string;
  /** When HR marked this cycle's dues paid; null while still outstanding. */
  paid_at: string | null;
  /** When this row's payslip was last emailed; null if never sent. */
  payslip_emailed_at: string | null;
}

export interface PayrollWithName extends Payroll {
  employee_name: string;
  /** Needed by the UI to know who can actually be mailed a payslip. */
  employee_email: string;
  /** Needed by the "Download PDF" button — it renders the same card as the email. */
  job_title: string;
  /** Payslip header details (Employee Type / Date of Joining / Office Location). */
  employment_type: EmploymentType;
  date_of_joining: string;
  location: string;
}

/**
 * A payroll row as the admin Payroll tab reads it: the payslip fields plus the
 * employee's work mode and the cycle's attendance split — how many present days
 * were in-office vs remote — counted live from attendance for the cycle window.
 */
export interface AdminPayrollRow extends PayrollWithName {
  work_mode: WorkMode;
  present_days: number;
  in_office_days: number;
}

export type CertificateType = "leaving" | "lor";

/**
 * A leaving certificate or letter of recommendation HR issued. Fields are a
 * snapshot taken at issue time (name, designation, dates) rather than a live
 * join to `employees` — a certificate is a record of what was actually
 * issued, and must keep reading the same after the employee's record changes
 * or is deleted.
 */
export interface Certificate {
  id: number;
  /** Null once the employee is deleted; the record itself is kept. */
  employee_id: number | null;
  type: CertificateType;
  employee_name: string;
  /** Snapshot from issue time; a live send prefers the employee's current email if they still exist. */
  employee_email: string;
  job_title: string;
  date_of_joining: string | null;
  /** Only meaningful for 'leaving'; null for other types. */
  last_working_day: string | null;
  /** The exact letter body HR wrote/edited for this issue. */
  body: string;
  created_at: string;
  created_by: number | null;
  /** Snapshot of where it was sent; null until the first send. */
  emailed_to: string | null;
  emailed_at: string | null;
}

export interface CertificateWithCreator extends Certificate {
  created_by_name: string | null;
}
