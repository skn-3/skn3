CREATE OR REPLACE FUNCTION public.set_montor_debit_number() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.invoice_number IS NULL THEN
    NEW.invoice_number := 'N3-' || lpad(nextval('public.montor_debit_seq')::text, 3, '0');
  END IF;
  RETURN NEW;
END $$;

UPDATE public.montor_debit_invoices
SET invoice_number = 'N3-' || lpad((regexp_replace(invoice_number, '\D', '', 'g'))::int::text, 3, '0')
WHERE invoice_number IS NOT NULL AND invoice_number !~ '^N3-';

SELECT setval('public.montor_debit_seq',
  GREATEST(7, COALESCE((SELECT MAX((regexp_replace(invoice_number,'\D','','g'))::int)
                        FROM public.montor_debit_invoices), 0)), true);