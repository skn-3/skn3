ALTER TABLE public.case_costs
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'ovrigt';

ALTER TABLE public.case_costs
  DROP CONSTRAINT IF EXISTS case_costs_category_check;

ALTER TABLE public.case_costs
  ADD CONSTRAINT case_costs_category_check
  CHECK (category IN ('ovrigt','reklamation'));