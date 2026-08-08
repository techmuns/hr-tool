-- Certificates HR issues to employees — leaving certificates, letters of
-- recommendation, and whatever else joins that list later. Emailed as an HTML
-- card (like a payslip) and downloadable as a PDF, with every issue kept as
-- history: who it went to, what it said, and whether/when it was sent.
--
-- Snapshot fields (employee_name, job_title, date_of_joining) are copied in at
-- issue time rather than joined live from `employees`, and employee_id is
-- nullable with ON DELETE SET NULL rather than CASCADE — a certificate is a
-- record of something that was actually issued, and removing the employee
-- later (this is often issued right before that happens) must not make that
-- record disappear or silently reattribute itself if the id is ever reused.
CREATE TABLE certificates (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id       INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  type              TEXT NOT NULL CHECK (type IN ('leaving', 'lor')),
  employee_name     TEXT NOT NULL,
  -- Snapshot of the address to fall back to once employee_id has gone NULL —
  -- the live employees.email is preferred for a re-send while the employee
  -- record still exists, since it may have been corrected since issue.
  employee_email    TEXT NOT NULL DEFAULT '',
  job_title         TEXT NOT NULL DEFAULT '',
  date_of_joining   TEXT,
  -- Only meaningful for 'leaving'; NULL for other types.
  last_working_day  TEXT,
  -- The exact letter body HR wrote/edited for this issue, so re-downloading or
  -- re-emailing later reproduces precisely what was already sent — not a
  -- fresh render from a template that may since have changed.
  body              TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  created_by        INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  -- Snapshot of where it was sent, independent of the employee's current (or
  -- future-deleted) email address.
  emailed_to        TEXT,
  emailed_at        TEXT
);
CREATE INDEX idx_certificates_employee ON certificates(employee_id, created_at);
