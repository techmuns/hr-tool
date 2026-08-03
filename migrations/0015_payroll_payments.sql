-- Payment tracking for a payroll run.
--
-- Salaries for a period are paid on the 11th of the following month, so a
-- generated payroll row sits unpaid until HR marks that cycle settled.
-- payslip_emailed_at records when the row's payslip was last mailed, so HR can
-- see at a glance who has already been sent one and re-send just the stragglers.
-- Both are nullable: every pre-existing row is unpaid and unmailed.
ALTER TABLE payroll ADD COLUMN paid_at TEXT;
ALTER TABLE payroll ADD COLUMN payslip_emailed_at TEXT;
