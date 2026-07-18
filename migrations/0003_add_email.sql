ALTER TABLE employees ADD COLUMN email TEXT NOT NULL DEFAULT '';

UPDATE employees SET email = 'alex.rivera@example.com'  WHERE name = 'Alex Rivera';
UPDATE employees SET email = 'priya.nair@example.com'   WHERE name = 'Priya Nair';
UPDATE employees SET email = 'sam.okoro@example.com'    WHERE name = 'Sam Okoro';
UPDATE employees SET email = 'dana.chen@example.com'    WHERE name = 'Dana Chen';
