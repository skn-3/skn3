ALTER TABLE public.montor_debit_invoices
  ADD COLUMN IF NOT EXISTS credited_from_invoice_id uuid REFERENCES public.montor_debit_invoices(id);