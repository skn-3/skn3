ALTER TABLE public.deviations ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE;

-- Backfill: existing resolved rows get created_at as a best-effort resolved_at
UPDATE public.deviations SET resolved_at = COALESCE(resolved_at, created_at) WHERE resolved = true AND resolved_at IS NULL;

-- Trigger: set resolved_at when resolved flips to true; clear when flipped back to false
CREATE OR REPLACE FUNCTION public.set_deviation_resolved_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.resolved = true AND (OLD.resolved IS DISTINCT FROM true) THEN
    NEW.resolved_at := now();
  ELSIF NEW.resolved = false AND OLD.resolved = true THEN
    NEW.resolved_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deviation_resolved_at ON public.deviations;
CREATE TRIGGER trg_deviation_resolved_at
BEFORE UPDATE ON public.deviations
FOR EACH ROW
EXECUTE FUNCTION public.set_deviation_resolved_at();