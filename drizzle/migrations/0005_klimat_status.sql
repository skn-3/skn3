ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS klimat_status text;
ALTER TABLE public.climate_events ADD COLUMN IF NOT EXISTS status text;