-- When we last emailed this employee an "you haven't clocked in" reminder,
-- as a UTC ISO date ("YYYY-MM-DD"). Null means never reminded. The weekday
-- reminder job (src/worker/attendanceReminders.ts) reads and writes this to
-- send at most one reminder per absence streak instead of nagging daily.
ALTER TABLE employees ADD COLUMN last_attendance_reminder_at TEXT;
