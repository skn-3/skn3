ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS hours_confirmed_at timestamptz;
UPDATE public.cases SET hours_confirmed_at = now()
 WHERE hours_confirmed_at IS NULL
   AND (COALESCE(extra_hours_sold,0) > 0 OR COALESCE(extra_hours_approved,0) > 0);