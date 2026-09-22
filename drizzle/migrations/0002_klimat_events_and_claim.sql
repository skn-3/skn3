ALTER TABLE public.case_climate_compensation
  ADD COLUMN IF NOT EXISTS claim_url text,
  ADD COLUMN IF NOT EXISTS total_trees integer;

CREATE TABLE IF NOT EXISTS public.climate_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  case_id uuid REFERENCES public.cases(id) ON DELETE CASCADE,
  visit_id uuid,
  upstream_key uuid NOT NULL,
  event_type text NOT NULL,
  tree_count integer NOT NULL DEFAULT 0,
  seller text,
  event_ref text NOT NULL UNIQUE,
  verification_id text,
  claim_url text,
  total_trees integer
);

GRANT SELECT ON public.climate_events TO authenticated;
GRANT ALL ON public.climate_events TO service_role;

ALTER TABLE public.climate_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "climate_events read" ON public.climate_events;
CREATE POLICY "climate_events read" ON public.climate_events
  FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS climate_events_case_idx ON public.climate_events(case_id);
CREATE INDEX IF NOT EXISTS climate_events_created_idx ON public.climate_events(created_at);