ALTER TABLE public.a_orders
  ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS order_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS pdf_path text;