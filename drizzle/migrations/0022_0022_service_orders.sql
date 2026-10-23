ALTER TABLE public.a_orders DROP CONSTRAINT IF EXISTS a_orders_order_kind_check;
ALTER TABLE public.a_orders ADD CONSTRAINT a_orders_order_kind_check CHECK (order_kind IN ('standard','komplettering','service'));
ALTER TABLE public.a_orders ADD COLUMN IF NOT EXISTS payer text NULL;
ALTER TABLE public.a_orders DROP CONSTRAINT IF EXISTS a_orders_payer_check;
ALTER TABLE public.a_orders ADD CONSTRAINT a_orders_payer_check CHECK (payer IS NULL OR payer IN ('mockfjards','n3prenad','kund'));
ALTER TABLE public.a_orders ADD COLUMN IF NOT EXISTS mockfjards_order_number text NULL;