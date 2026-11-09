ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS customer_followup_contacted_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_followup_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_followup_done_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_followup_done_by text;

COMMENT ON COLUMN public.cases.customer_followup_done_at IS 'Kundavstämning efter montage_klart (kontaktad + signerat) klarmarkerad av kontoret. Ändrar inte status.';

-- Backfill: redan fakturerade ärenden ska inte bli öppna uppgifter. Behåll updated_at orört.
ALTER TABLE public.cases DISABLE TRIGGER update_cases_updated_at;
UPDATE public.cases
   SET customer_followup_done_at = now(),
       customer_followup_done_by = 'Före funktionen'
 WHERE status = 'fakturerad' AND customer_followup_done_at IS NULL;
ALTER TABLE public.cases ENABLE TRIGGER update_cases_updated_at;

-- Montörer har en UPDATE-policy på sina ärenden; de får inte röra kundavstämningen.
CREATE OR REPLACE FUNCTION public.cases_protect_followup_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.auth_user_role() = 'montor' AND (
       NEW.customer_followup_contacted_at IS DISTINCT FROM OLD.customer_followup_contacted_at
    OR NEW.customer_followup_signed_at IS DISTINCT FROM OLD.customer_followup_signed_at
    OR NEW.customer_followup_done_at IS DISTINCT FROM OLD.customer_followup_done_at
    OR NEW.customer_followup_done_by IS DISTINCT FROM OLD.customer_followup_done_by
  ) THEN
    RAISE EXCEPTION 'Kundavstämningen sköts av kontoret';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS cases_protect_followup_fields ON public.cases;
CREATE TRIGGER cases_protect_followup_fields
  BEFORE UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.cases_protect_followup_fields();

CREATE INDEX IF NOT EXISTS cases_followup_open_idx
  ON public.cases (status_changed_at)
  WHERE customer_followup_done_at IS NULL AND status IN ('montage_klart','fakturerad');