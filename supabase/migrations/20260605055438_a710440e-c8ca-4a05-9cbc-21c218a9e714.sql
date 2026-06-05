CREATE TABLE public.insight_history (
  id uuid primary key default gen_random_uuid(),
  user_name text not null,
  insight_id text not null,
  shown_at timestamptz not null default now()
);

CREATE INDEX idx_insight_history_user_shown ON public.insight_history (user_name, shown_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.insight_history TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insight_history TO authenticated;
GRANT ALL ON public.insight_history TO service_role;