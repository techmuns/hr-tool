-- Bill attachment for a reimbursement (a PDF or photo of the receipt).
--
-- The file itself lives in R2, not here: D1 caps a row — and any single BLOB —
-- at 2 MB, which is below the 3 MB we accept. The row keeps the object key plus
-- the metadata needed to serve the file back under its original name and type.
-- All four are nullable: a bill is optional, and every pre-existing row has none.
ALTER TABLE reimbursements ADD COLUMN bill_key TEXT;
ALTER TABLE reimbursements ADD COLUMN bill_name TEXT;
ALTER TABLE reimbursements ADD COLUMN bill_type TEXT;
ALTER TABLE reimbursements ADD COLUMN bill_size INTEGER;
