ALTER TABLE public.montor_debit_invoices
  DROP CONSTRAINT IF EXISTS montor_debit_invoices_status_check;
ALTER TABLE public.montor_debit_invoices
  ADD CONSTRAINT montor_debit_invoices_status_check
  CHECK (status IN ('sent', 'paid', 'cancelled', 'credited'));
