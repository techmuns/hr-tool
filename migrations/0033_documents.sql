-- HR document generator: offer letters, certificates, letters of recommendation
-- and whatever template joins that list later. Each row is one document a user
-- built from a template — the template's fixed layout lives in code (the client
-- template registry), and only the dynamic field values are stored here, as a
-- single JSON blob that is the document's one source of truth. Re-opening a
-- document rehydrates that blob into the same editor it was written in.
--
-- template_id is a free-text registry key (not a CHECK-constrained enum) on
-- purpose: adding a new document type is a code-only change to the registry,
-- never a migration. recipient_name is denormalised so the history list can be
-- shown without parsing every data blob. employee_id is nullable with
-- ON DELETE SET NULL — a generated document is a record of something that was
-- actually produced and must outlive the employee it referenced.
CREATE TABLE documents (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Registry key identifying which template built this document, e.g.
  -- 'offer_letter', 'internship_certificate', 'lor'.
  template_id    TEXT NOT NULL,
  -- User-facing name for the history list; defaults from the recipient + type.
  title          TEXT NOT NULL DEFAULT '',
  -- Denormalised recipient so the list renders without parsing `data`.
  recipient_name TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'generated')),
  -- JSON object of dynamic field values keyed by field id — the single source of
  -- truth shared by the left-side form and the right-side live preview.
  data           TEXT NOT NULL DEFAULT '{}',
  -- Optional link to the employee the document is about, when it was started
  -- from the directory. Kept even after that employee is removed.
  employee_id    INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  created_by     INTEGER REFERENCES employees(id) ON DELETE SET NULL
);
CREATE INDEX idx_documents_updated ON documents(updated_at);
