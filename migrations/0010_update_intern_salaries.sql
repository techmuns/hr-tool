-- Salary correction from HR's payment/team sheet (In-office Interns, Remote
-- Interns, Full-Time Employment). monthly_salary is stored in paise.
-- Matched by email since it's the one stable identifier available.
UPDATE employees SET monthly_salary = 1000000 WHERE email = 'akshatt151@gmail.com';         -- Akshita Rathi, 10000
UPDATE employees SET monthly_salary = 1000000 WHERE email = 'nadamsaluja@gmail.com';          -- Nadam Saluja, 10000
UPDATE employees SET monthly_salary = 1000000 WHERE email = 'naval2274gupta@gmail.com';       -- Naval Gupta, 10000
UPDATE employees SET monthly_salary = 1000000 WHERE email = 'vipulagrawal2502@gmail.com';     -- Vipul Agrawal, 10000
UPDATE employees SET monthly_salary = 1000000 WHERE email = 'neha.mandal1190@gmail.com';      -- Neha Mandal, 10000
UPDATE employees SET monthly_salary = 1000000 WHERE email = 'omnaik6969@gmail.com';           -- Om Naik, 10000
UPDATE employees SET monthly_salary = 1000000 WHERE email = 'jackivcodes@gmail.com';          -- Jackiv Garg, 10000
UPDATE employees SET monthly_salary = 1000000 WHERE email = 'gauriagarwal25@gmail.com';       -- Gauri Agarwal, 10000
UPDATE employees SET monthly_salary = 1500000 WHERE email = 'harshawardhanghatage78@gmail.com'; -- Harshawardhan Ghatage, 15000
UPDATE employees SET monthly_salary = 1500000 WHERE email = 'rudramittal24@gmail.com';        -- Rudra Mittal, 15000
UPDATE employees SET monthly_salary = 2000000 WHERE email = 'anantsingh4444@gmail.com';       -- Anant Singh, 20000
UPDATE employees SET monthly_salary = 4000000 WHERE email = 'yashkalra2013@gmail.com';        -- Yash Kalra, 40000

-- These three appear on the sheet with a fuller name than what's on file.
-- Same email/person, salary corrected at the same time.
UPDATE employees SET name = 'Diya Rawat', monthly_salary = 1000000 WHERE email = 'rdiya0315@gmail.com';               -- was "Diya", 10000
UPDATE employees SET name = 'Aashita Chandel', monthly_salary = 1000000 WHERE email = 'aashita1619@gmail.com';         -- was "Aashita", 10000
UPDATE employees SET name = 'Tarandeep Singh Khurana', monthly_salary = 1000000 WHERE email = 'tarandeepkhurana2005@gmail.com'; -- was "Tarandeep Khurana", 10000
UPDATE employees SET name = 'Sahil Garg', monthly_salary = 5000000 WHERE email = 'sahilzeroes1@gmail.com';             -- was "Sahil", 50000
