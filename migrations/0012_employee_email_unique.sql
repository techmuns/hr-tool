-- Enforce case-insensitive email uniqueness. Email is the identity key used by
-- OTP login and Munshot-JWT mapping, so duplicates must not silently collapse
-- to one arbitrary account. Rows with NULL/empty email (legacy seed data) are
-- excluded so they don't collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_email_unique
  ON employees (lower(email))
  WHERE email IS NOT NULL AND email != '';
