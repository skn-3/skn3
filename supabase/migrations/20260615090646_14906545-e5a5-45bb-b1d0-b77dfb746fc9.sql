ALTER TABLE public.a_orders ADD COLUMN IF NOT EXISTS mockfjards_invoice_number text;
CREATE INDEX IF NOT EXISTS a_orders_mockfjards_invoice_number_idx ON public.a_orders (mockfjards_invoice_number);