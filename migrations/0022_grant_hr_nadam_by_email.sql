-- Pin Nadam's HR access to an exact email instead of a name pattern.
--
-- 0019 matched `lower(name) LIKE '%nadam%'`, which is a guess: it promotes
-- nobody if the stored name is spelled differently, and promotes the wrong
-- person if anyone else's name happens to contain the substring. Neither
-- failure is visible — a migration that updates zero rows succeeds quietly, and
-- D1 records it as applied so it never runs again.
--
-- Email is the unambiguous handle, so match on that. Independent of whether
-- 0019 matched: if it did, this is a no-op; if it did not, this is the fix.
UPDATE employees
   SET tier = 'hr',
       role = 'admin'
 WHERE lower(email) = 'nadamsaluja@gmail.com'
   AND tier <> 'founder';
