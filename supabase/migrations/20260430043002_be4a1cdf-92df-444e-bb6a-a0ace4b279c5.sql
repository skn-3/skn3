
CREATE TABLE public.sheet_metal_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  status text NOT NULL DEFAULT 'skickad',
  profiles jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  delivery_address text NOT NULL,
  montor_name text,
  montor_phone text
);

ALTER TABLE public.sheet_metal_orders DISABLE ROW LEVEL SECURITY;

CREATE INDEX idx_sheet_metal_orders_case_id ON public.sheet_metal_orders(case_id);

INSERT INTO storage.buckets (id, name, public)
VALUES ('sheet-metal-sketches', 'sheet-metal-sketches', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read sheet-metal-sketches"
ON storage.objects FOR SELECT
USING (bucket_id = 'sheet-metal-sketches');

CREATE POLICY "Anyone can upload sheet-metal-sketches"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'sheet-metal-sketches');

CREATE POLICY "Anyone can update sheet-metal-sketches"
ON storage.objects FOR UPDATE
USING (bucket_id = 'sheet-metal-sketches');
