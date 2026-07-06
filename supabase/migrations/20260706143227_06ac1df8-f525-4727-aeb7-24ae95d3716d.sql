ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS public_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS cases_public_token_idx ON public.cases (public_token);