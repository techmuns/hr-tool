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
  /** 1 = archived: kept for the record but hidden from attendance/payroll/directory. */
  archived: number; // 0 | 1
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
  /** 1 when a present day was manually marked in-office. 0 | 1. */
  in_office: number;
  /**
   * 1 when HR manually marked this day work-from-home. 0 | 1. Usually paired
   * with status = 'present' (the employee clocked in), but can also be set on
   * a status = 'absent' day — HR marking someone WFH who never clocked in.
   * That combination renders identically to a plain "not clocked in" cell
   * except its second line reads "wfh" instead of "no clock" (see
   * AttendanceTable/WorkingDays) — it does not turn the box green/dashed.
   */
  wfh: number;
  /** 1 when a present day was manually marked half-day. 0 | 1. No payroll effect. */
  half_day: number;
}

export interface AttendanceWithName extends Attendance {
  employee_name: string;
}

/** A national/festival holiday HR marked by hand. One row per calendar date. */
export interface Holiday {
  work_date: string;
  name: string;
  created_at: string;
  created_by: number | null;
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
  /** Present days HR manually flagged half-day this cycle. */
  half_days: number;
  /** Days HR manually flagged work-from-home this cycle (nothing is inferred). */
  wfh_days: number;
  /**
   * HR's manual reimbursement breakup for this cycle, if any. `reimbursements`
   * above already reflects HALF of this total, or ALL of it when an admin has
   * flipped `reimbursement_breakup_full` on; the raw total and entries are
   * here so the Payroll tab can show the full breakdown in a dropdown. Null
   * when HR hasn't entered one (approved requests stand).
   */
  reimbursement_breakup_total: number | null;
  reimbursement_breakup_entries: string | null; // raw JSON, parsed client-side
  /** 1 when this breakup pays out in full instead of the standard 50%. */
  reimbursement_breakup_full: number | null;
}

/** One labelled line in HR's daily reimbursement notepad; amount in paise. */
export interface BreakupEntry {
  label: string;
  amount: number;
}

/** HR's reimbursement notepad for one employee in one pay cycle. */
export interface ReimbursementBreakup {
  employee_id: number;
  period: string;
  entries: BreakupEntry[];
  total: number;
  /** Admin-only: pays out the FULL total instead of the standard 50%. */
  full_reimbursement: boolean;
  updated_at: string;
}

export type DocumentStatus = "draft" | "generated";

/**
 * One document produced by the Document Generator (offer letter, certificate,
 * LOR, …). The template's fixed layout lives in the client template registry
 * keyed by `template_id`; only the dynamic field values are persisted, in
 * `data` — a JSON object keyed by field id that is the document's single source
 * of truth, shared by the left-side form and the right-side live preview.
 *
 * `data` is stored as a JSON string in D1 (`DocumentRecord`) and returned to the
 * client already parsed (`DocumentRow`).
 */
export interface DocumentRecord {
  id: number;
  template_id: string;
  title: string;
  recipient_name: string;
  status: DocumentStatus;
  /** JSON string of `{ [fieldId]: value }` as stored in D1. */
  data: string;
  /** Null once the referenced employee is deleted; the document is kept. */
  employee_id: number | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
}

/** A document as returned by the API: `data` parsed, creator name joined. */
export interface DocumentRow {
  id: number;
  template_id: string;
  title: string;
  recipient_name: string;
  status: DocumentStatus;
  data: Record<string, string>;
  employee_id: number | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  created_by_name: string | null;
}
