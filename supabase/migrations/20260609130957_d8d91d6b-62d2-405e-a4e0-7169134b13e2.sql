ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS ue_supplier text,
  ADD COLUMN IF NOT EXISTS ue_document_path text,
  ADD COLUMN IF NOT EXISTS ue_total_excl numeric,
  ADD COLUMN IF NOT EXISTS markup_percent numeric;