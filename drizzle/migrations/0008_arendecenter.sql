-- Ärendecenter: avvikelser (deviations) blir ärenden med bollen, ägare, nästa steg och tidslinje.
-- Se src/lib/tickets.ts.

-- 1) Nya fält på deviations
ALTER TABLE public.deviations
  ADD COLUMN IF NOT EXISTS ticket_no integer GENERATED ALWAYS AS IDENTITY,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS ball text NOT NULL DEFAULT 'oss',
  ADD COLUMN IF NOT EXISTS owner text,
  ADD COLUMN IF NOT EXISTS next_step text,
  ADD COLUMN IF NOT EXISTS next_step_due date,
  ADD COLUMN IF NOT EXISTS next_step_owner text,
  ADD COLUMN IF NOT EXISTS last_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS merged_into_id uuid REFERENCES public.deviations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS deviations_open_idx ON public.deviations (ball, next_step_due) WHERE resolved = false AND merged_into_id IS NULL;
CREATE INDEX IF NOT EXISTS deviations_last_event_idx ON public.deviations (last_event_at);

-- 2) Händelser kan höra till ett ärende
ALTER TABLE public.case_events ADD COLUMN IF NOT EXISTS deviation_id uuid REFERENCES public.deviations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS case_events_deviation_idx ON public.case_events (deviation_id, created_at DESC);

-- 3) Backfill
UPDATE public.deviations SET
  priority = CASE
    WHEN description ~ '^\[HOG\]' THEN 'hog'
    WHEN description ~ '^\[LAG\]' THEN 'lag'
    ELSE 'medium' END,
  description = regexp_replace(description, '^\[(HOG|MEDIUM|LAG)\]\s*', ''),
  status = COALESCE(status, CASE WHEN resolved THEN 'klar' ELSE 'ny' END)
WHERE title IS NULL;

UPDATE public.deviations SET
  title = left(regexp_replace(split_part(description, E'\n', 1), '\s+', ' ', 'g'), 80),
  ball = CASE
    WHEN resolved THEN 'oss'
    WHEN status = 'vantar_leverans' OR factory_email_sent_at IS NOT NULL THEN 'fabrik'
    ELSE 'oss' END,
  last_event_at = GREATEST(
    created_at,
    COALESCE(action_taken_at, created_at),
    COALESCE(factory_email_sent_at, created_at),
    COALESCE((SELECT max((e->>'at')::timestamptz) FROM jsonb_array_elements(COALESCE(action_log, '[]'::jsonb)) e WHERE e ? 'at'), created_at),
    COALESCE((SELECT max(ce.created_at) FROM public.case_events ce WHERE ce.deviation_id = deviations.id), created_at)
  )
WHERE title IS NULL;

-- 4)
CREATE OR REPLACE FUNCTION public.case_events_touch_deviation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.deviation_id IS NOT NULL THEN
    UPDATE public.deviations SET last_event_at = GREATEST(COALESCE(last_event_at, NEW.created_at), NEW.created_at) WHERE id = NEW.deviation_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS case_events_touch_deviation ON public.case_events;
CREATE TRIGGER case_events_touch_deviation AFTER INSERT ON public.case_events FOR EACH ROW EXECUTE FUNCTION public.case_events_touch_deviation();

-- 5)
CREATE OR REPLACE FUNCTION public.deviations_log_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_by text := COALESCE(public.auth_user_name(), 'System');
  v_parts text[] := '{}';
  v_ball_label text;
  v_status_label text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_status_label := CASE NEW.status WHEN 'ny' THEN 'Ny' WHEN 'under_atgard' THEN 'Pågår' WHEN 'vantar_leverans' THEN 'Väntar leverans' WHEN 'klar' THEN 'Löst' WHEN 'avskriven' THEN 'Avskriven' ELSE COALESCE(NEW.status, '—') END;
    v_parts := v_parts || ('Status: ' || v_status_label);
  END IF;
  IF NEW.ball IS DISTINCT FROM OLD.ball THEN
    v_ball_label := CASE NEW.ball WHEN 'oss' THEN 'oss' WHEN 'fabrik' THEN 'fabriken' WHEN 'montor' THEN 'montören' WHEN 'kund' THEN 'kunden' ELSE COALESCE(NEW.ball, '—') END;
    v_parts := v_parts || ('Bollen ligger hos ' || v_ball_label);
  END IF;
  IF NEW.owner IS DISTINCT FROM OLD.owner THEN
    v_parts := v_parts || ('Ägare: ' || COALESCE(NEW.owner, 'ingen'));
  END IF;
  IF NEW.next_step IS DISTINCT FROM OLD.next_step OR NEW.next_step_due IS DISTINCT FROM OLD.next_step_due THEN
    v_parts := v_parts || ('Nästa steg: ' || COALESCE(NEW.next_step, '—') || CASE WHEN NEW.next_step_due IS NOT NULL THEN ' (' || to_char(NEW.next_step_due, 'YYYY-MM-DD') || ')' ELSE '' END);
  END IF;
  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    v_parts := v_parts || ('Prioritet: ' || CASE NEW.priority WHEN 'hog' THEN 'Hög' WHEN 'lag' THEN 'Låg' ELSE 'Normal' END);
  END IF;
  IF array_length(v_parts, 1) > 0 THEN
    INSERT INTO public.case_events (case_id, deviation_id, event_type, description, created_by)
    VALUES (NEW.case_id, NEW.id, 'ticket_change', array_to_string(v_parts, ' · '), v_by);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS deviations_log_changes ON public.deviations;
CREATE TRIGGER deviations_log_changes AFTER UPDATE ON public.deviations FOR EACH ROW EXECUTE FUNCTION public.deviations_log_changes();

-- 6)
CREATE OR REPLACE FUNCTION public.deviations_protect_office_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.auth_user_role() = 'montor' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.ball := 'oss';
      NEW.owner := NULL;
      NEW.next_step := NULL;
      NEW.next_step_due := NULL;
      NEW.next_step_owner := NULL;
      NEW.merged_into_id := NULL;
      NEW.last_event_at := COALESCE(NEW.last_event_at, now());
    ELSIF NEW.ball IS DISTINCT FROM OLD.ball
       OR NEW.owner IS DISTINCT FROM OLD.owner
       OR NEW.next_step IS DISTINCT FROM OLD.next_step
       OR NEW.next_step_due IS DISTINCT FROM OLD.next_step_due
       OR NEW.next_step_owner IS DISTINCT FROM OLD.next_step_owner
       OR NEW.merged_into_id IS DISTINCT FROM OLD.merged_into_id THEN
      RAISE EXCEPTION 'Bollen, ägare och nästa steg styrs av kontoret';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS deviations_protect_office_fields ON public.deviations;
CREATE TRIGGER deviations_protect_office_fields BEFORE INSERT OR UPDATE ON public.deviations FOR EACH ROW EXECUTE FUNCTION public.deviations_protect_office_fields();

-- 7)
CREATE OR REPLACE FUNCTION public.deviations_init_last_event()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.last_event_at IS NULL THEN NEW.last_event_at := COALESCE(NEW.created_at, now()); END IF;
  IF NEW.title IS NULL OR NEW.title = '' THEN NEW.title := left(regexp_replace(split_part(COALESCE(NEW.description, ''), E'\n', 1), '\s+', ' ', 'g'), 80); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS deviations_init_last_event ON public.deviations;
CREATE TRIGGER deviations_init_last_event BEFORE INSERT ON public.deviations FOR EACH ROW EXECUTE FUNCTION public.deviations_init_last_event();