ALTER TABLE public.cases
  ADD COLUMN media_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN carry_help_needed BOOLEAN NOT NULL DEFAULT false;