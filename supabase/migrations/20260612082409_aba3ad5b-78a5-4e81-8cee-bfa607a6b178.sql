ALTER TABLE public.montor_teams
  ADD COLUMN IF NOT EXISTS invoice_email text,
  ADD COLUMN IF NOT EXISTS next_invoice_number integer NOT NULL DEFAULT 1;

ALTER TABLE public.a_orders ALTER COLUMN order_number DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.set_a_order_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.order_number IS NULL AND COALESCE(NEW.status, 'order') <> 'credited' THEN
    NEW.order_number := nextval('public.a_order_number_seq');
  END IF;
  RETURN NEW;
END;
$$;