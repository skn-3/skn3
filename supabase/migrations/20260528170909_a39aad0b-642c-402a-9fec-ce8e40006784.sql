CREATE TABLE public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  actor_name TEXT NOT NULL,
  actor_role TEXT,
  action TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  case_id TEXT,
  deviation_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT
);

GRANT SELECT, INSERT ON public.activity_log TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;

CREATE INDEX idx_activity_log_created ON public.activity_log(created_at DESC);
CREATE INDEX idx_activity_log_actor ON public.activity_log(actor_name);
CREATE INDEX idx_activity_log_category ON public.activity_log(category);
CREATE INDEX idx_activity_log_case ON public.activity_log(case_id);

-- NOTE: Activity log innehåller personuppgifter (medarbetares handlingar). 
-- Måste ingå i bolagets GDPR-dokumentation.
-- TODO: Överväg cleanup-job som arkiverar/raderar rader äldre än 12 månader.
COMMENT ON TABLE public.activity_log IS 'Systemövergripande aktivitetslogg. GDPR: innehåller medarbetares handlingar. Överväg retention-policy (12 mån).';