INSERT INTO employees (name, location, work_mode, date_of_joining, role, monthly_salary) VALUES
  ('Alex Rivera',  'Austin, TX',    'in-office', '2023-02-15', 'employee', 600000),
  ('Priya Nair',   'Bengaluru, IN', 'wfh',       '2022-09-01', 'employee', 550000),
  ('Sam Okoro',    'Lagos, NG',     'wfh',       '2024-01-10', 'employee', 480000),
  ('Dana Chen',    'Remote',        'in-office', '2021-06-20', 'admin',    900000);

INSERT INTO attendance (employee_id, work_date, clock_in, clock_out, status) VALUES
  (1, '2026-07-15', '2026-07-15T09:02:00Z', '2026-07-15T17:30:00Z', 'present'),
  (1, '2026-07-16', '2026-07-16T09:10:00Z', '2026-07-16T17:45:00Z', 'present'),
  (2, '2026-07-15', '2026-07-15T08:45:00Z', '2026-07-15T16:50:00Z', 'present'),
  (2, '2026-07-16', NULL, NULL, 'leave'),
  (3, '2026-07-15', NULL, NULL, 'absent'),
  (3, '2026-07-16', '2026-07-16T09:30:00Z', '2026-07-16T17:00:00Z', 'present');

INSERT INTO leave_requests (employee_id, start_date, end_date, leave_type, reason, status) VALUES
  (2, '2026-07-16', '2026-07-16', 'paid',   'Medical appointment', 'approved'),
  (3, '2026-07-20', '2026-07-22', 'unpaid', 'Personal',            'pending');

INSERT INTO feedback (employee_id, message) VALUES
  (1, 'Would love standing desks in the Austin office.');

INSERT INTO chat_messages (employee_id, sender_role, body) VALUES
  (1, 'employee', 'Hi HR, question about my leave balance.'),
  (1, 'admin',    'Sure Alex, you have 8 paid days left.');

INSERT INTO payroll (employee_id, period, base_salary, paid_days, unpaid_days, deductions, net_pay) VALUES
  (1, '2026-06', 600000, 22, 0, 0, 600000),
  (2, '2026-06', 550000, 21, 1, 25000, 525000);
