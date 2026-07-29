-- Let employees choose to send feedback anonymously. When set, the sender's
-- name is not revealed to founders.
ALTER TABLE feedback ADD COLUMN anonymous INTEGER NOT NULL DEFAULT 0
  CHECK (anonymous IN (0, 1));
