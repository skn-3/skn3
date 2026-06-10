ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS declined_at timestamptz,
  ADD COLUMN IF NOT EXISTS decline_name text,
  ADD COLUMN IF NOT EXISTS decline_reason text;