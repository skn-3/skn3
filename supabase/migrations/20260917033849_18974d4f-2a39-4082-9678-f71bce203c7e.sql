ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS is_gotland boolean NOT NULL DEFAULT false;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS congard_hours numeric NOT NULL DEFAULT 0;
INSERT INTO public.montor_teams (name, is_active)
SELECT 'Congard', true
WHERE NOT EXISTS (SELECT 1 FROM public.montor_teams WHERE name = 'Congard');