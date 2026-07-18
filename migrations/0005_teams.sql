CREATE TABLE teams (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL UNIQUE,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE employees ADD COLUMN team_id INTEGER REFERENCES teams(id);
ALTER TABLE employees ADD COLUMN job_title TEXT NOT NULL DEFAULT '';

INSERT INTO teams (name) VALUES ('Engineering'), ('Design'), ('Operations');

UPDATE employees SET team_id = (SELECT id FROM teams WHERE name = 'Engineering'), job_title = 'Software Engineer'
  WHERE name = 'Alex Rivera';
UPDATE employees SET team_id = (SELECT id FROM teams WHERE name = 'Design'), job_title = 'Product Designer'
  WHERE name = 'Priya Nair';
UPDATE employees SET team_id = (SELECT id FROM teams WHERE name = 'Operations'), job_title = 'Operations Associate'
  WHERE name = 'Sam Okoro';
UPDATE employees SET job_title = 'HR Manager'
  WHERE name = 'Dana Chen';
