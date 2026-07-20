CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email);

-- Replace demo/mock roster with the real team, in FK-safe order.
DELETE FROM attendance;
DELETE FROM leave_requests;
DELETE FROM feedback;
DELETE FROM chat_messages;
DELETE FROM payroll;
DELETE FROM reimbursements;
DELETE FROM employees;
DELETE FROM teams;

INSERT INTO teams (name) VALUES
  ('Equity'), ('Founders Office'), ('Backend'), ('AI Agent'),
  ('HR'), ('Frontend'), ('AI Engineer'), ('Product Manager');

-- role: hr/founder tiers map to the backend 'admin' role (tier itself is a
-- frontend concept, see src/web/hostAuth.ts); everyone else is 'employee'.
INSERT INTO employees (name, location, work_mode, date_of_joining, role, monthly_salary, email) VALUES
  ('Aashita',               'Mumbai',        'wfh',       '2026-06-22', 'employee', 1000000, 'aashita1619@gmail.com'),
  ('Akshita Rathi',         'New Delhi',     'wfh',       '2026-01-01', 'admin',    0,       'akshatt151@gmail.com'),
  ('Anant Singh',           '',              'wfh',       '2026-01-01', 'employee', 0,       'anantsingh4444@gmail.com'),
  ('Gauri Agarwal',         'Uttrakhand',    'wfh',       '2026-04-07', 'employee', 1000000, 'gauriagarwal25@gmail.com'),
  ('Harshawardhan Ghatage', 'Pune',          'wfh',       '2025-09-05', 'employee', 1000000, 'harshawardhanghatage78@gmail.com'),
  ('Jackiv Garg',           'New Delhi',     'wfh',       '2026-04-02', 'employee', 1000000, 'jackivcodes@gmail.com'),
  ('Nadam Saluja',          'New Delhi',     'wfh',       '2026-01-01', 'employee', 1000000, 'nadamsaluja@gmail.com'),
  ('Naval Gupta',           'Ghaziabad',     'in-office', '2026-04-29', 'employee', 1000000, 'naval2274gupta@gmail.com'),
  ('Neha Mandal',           'Kolkata',       'wfh',       '2026-02-04', 'employee', 1000000, 'neha.mandal1190@gmail.com'),
  ('Nitish Chhabra',        '',              'in-office', '2026-01-01', 'admin',    0,       'nitish@muns.io'),
  ('Om Naik',               'Noida',         'wfh',       '2026-05-13', 'employee', 0,       'omnaik6969@gmail.com'),
  ('Diya',                  'Yamunanagar',   'in-office', '2026-04-01', 'admin',    0,       'rdiya0315@gmail.com'),
  ('Rudra Mittal',          'Yamunanagar',   'wfh',       '2026-04-04', 'employee', 0,       'rudramittal24@gmail.com'),
  ('Sahil',                 'Bahadurgarh',   'wfh',       '2026-06-01', 'employee', 0,       'sahilzeroes1@gmail.com'),
  ('Tarandeep Khurana',     'Indore, MP',    'wfh',       '2026-05-13', 'employee', 1000000, 'tarandeepkhurana2005@gmail.com'),
  ('Vipul Agrawal',         'New Delhi',     'in-office', '2026-03-11', 'employee', 1000000, 'vipulagrawal2502@gmail.com'),
  ('Yash Kalra',            'Lucknow, UP',   'wfh',       '2025-02-02', 'employee', 1000000, 'yashkalra2013@gmail.com'),
  ('Ceekay',                '',              'in-office', '2026-01-01', 'admin',    0,       'ceekay@muns.io');

UPDATE employees SET team_id = (SELECT id FROM teams WHERE name = 'Equity'),           job_title = 'Equity'           WHERE email = 'aashita1619@gmail.com';
UPDATE employees SET team_id = (SELECT id FROM teams WHERE name = 'Founders Office'),  job_title = 'HR'               WHERE email = 'akshatt151@gmail.com';
UPDATE employees SET team_id = (SELECT id FROM teams WHERE name = 'Backend'),          job_title = 'Backend'          WHERE email = 'anantsingh4444@gmail.com';
UPDATE employees SET team_id = (SELECT id FROM teams WHERE name = 'Backend'),          job_title = 'Backend'          WHERE email = 'gauriagarwal25@gmail.com';
UPDATE employees SET team_id = (SELECT id FROM teams WHERE name = 'AI Agent'),         job_title = 'AI Agent'         WHERE email = 'harshawardhanghatage78@gmail.com';
UPDATE employees SET team_id = (SELECT id FROM teams WHERE name = 'Backend'),          job_title = 'Backend'          WHERE email = 'jackivcodes@gmail.com';
UPDATE employees SET team_id = (SELECT id FROM teams WHERE name = 'Equity'),           job_title = 'Equity'           WHERE email = 'nadamsaluja@gmail.com';
UPDATE employees SET team_id = (SELECT id FROM teams WHERE name = 'Equity'),           job_title = 'Equity'           WHERE email = 'naval2274gupta@gmail.com';
UPDATE employees SET team_id = (SELECT id FROM teams WHERE name = 'Equity'),           job_title = 'Equity'           WHERE email = 'neha.mandal1190@gmail.com';
UPDATE employees SET team_id = (SELECT id FROM teams WHERE name = 'Founders Office'),  job_title = 'Founder'          WHERE email = 'nitish@muns.io';
UPDATE employees SET team_id = (SELECT id FROM teams WHERE name = 'Backend'),          job_title = 'Backend'          WHERE email = 'omnaik6969@gmail.com';
UPDATE employees SET team_id = (SELECT id FROM teams WHERE name = 'HR'),               job_title = 'HR'               WHERE email = 'rdiya0315@gmail.com';
UPDATE employees SET team_id = (SELECT id FROM teams WHERE name = 'Frontend'),         job_title = 'Frontend'         WHERE email = 'rudramittal24@gmail.com';
UPDATE employees SET team_id = (SELECT id FROM teams WHERE name = 'AI Engineer'),      job_title = 'AI Engineer'      WHERE email = 'sahilzeroes1@gmail.com';
UPDATE employees SET team_id = (SELECT id FROM teams WHERE name = 'AI Agent'),         job_title = 'AI Agent'         WHERE email = 'tarandeepkhurana2005@gmail.com';
UPDATE employees SET team_id = (SELECT id FROM teams WHERE name = 'Equity'),           job_title = 'Equity'           WHERE email = 'vipulagrawal2502@gmail.com';
UPDATE employees SET team_id = (SELECT id FROM teams WHERE name = 'Product Manager'),  job_title = 'Product Manager'  WHERE email = 'yashkalra2013@gmail.com';
UPDATE employees SET team_id = (SELECT id FROM teams WHERE name = 'Founders Office'),  job_title = 'Founder'          WHERE email = 'ceekay@muns.io';
