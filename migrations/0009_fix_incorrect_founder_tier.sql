-- 0007_employee_tier.sql promoted every existing role='admin' employee to
-- tier='founder' as a one-time bootstrap. That blanket UPDATE incorrectly
-- caught HR accounts that already had role='admin' before the tier column
-- existed, not just the actual founders. Demote the two accounts that
-- should only have HR access back down.
UPDATE employees SET tier = 'hr'
  WHERE tier = 'founder' AND email IN ('akshatt151@gmail.com', 'rdiya0315@gmail.com');
