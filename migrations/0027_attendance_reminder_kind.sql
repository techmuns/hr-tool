-- How the last clock-in reminder was sent: 'auto' (the weekday cron) or
-- 'manual' (HR triggered it from the Attendance tab). Null when never reminded.
-- Lets the Attendance tab show HR which reminders went out automatically vs by
-- hand. Paired with last_attendance_reminder_at (migration 0026).
ALTER TABLE employees ADD COLUMN last_attendance_reminder_kind TEXT
  CHECK (last_attendance_reminder_kind IN ('auto', 'manual'));
