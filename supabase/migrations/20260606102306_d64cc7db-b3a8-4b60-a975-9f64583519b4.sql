ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS units integer;
ALTER TABLE public.cases ADD CONSTRAINT cases_units_nonneg CHECK (units IS NULL OR units >= 0);