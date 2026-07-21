CREATE TABLE roles (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL UNIQUE,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO roles (name)
  SELECT DISTINCT job_title FROM employees WHERE job_title <> '';
