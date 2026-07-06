ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS status_changed_at timestamptz NOT NULL DEFAULT now();

UPDATE public.cases c
SET status_changed_at = COALESCE(
  (SELECT max(e.created_at) FROM public.case_events e
   WHERE e.case_id = c.id AND e.event_type = 'status_change'),
  c.created_at
);

CREATE OR REPLACE FUNCTION public.touch_status_changed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_status_changed_at ON public.cases;
CREATE TRIGGER trg_touch_status_changed_at
BEFORE UPDATE ON public.cases
FOR EACH ROW EXECUTE FUNCTION public.touch_status_changed_at();