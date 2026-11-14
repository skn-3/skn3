CREATE TABLE public.calendar_connections (
  user_name text PRIMARY KEY,
  last_fetched_at timestamptz,
  last_client text,
  last_user_agent text,
  fetch_count integer NOT NULL DEFAULT 0,
  guide_sent_at timestamptz,
  guide_sent_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.calendar_connections TO authenticated;
GRANT ALL ON public.calendar_connections TO service_role;

ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calendar_connections_select_own_or_staff"
  ON public.calendar_connections FOR SELECT TO authenticated
  USING (
    user_name = public.auth_user_name()
    OR public.auth_is_admin()
    OR public.auth_user_role() IN ('seller', 'coordinator')
  );

COMMENT ON TABLE public.calendar_connections IS 'Kalenderkoppling per användare/team. Skrivs bara av edge-funktionerna calendar-ics och calendar-connect (service role).';

CREATE TABLE public.calendar_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  popup_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

GRANT SELECT, UPDATE ON public.calendar_settings TO authenticated;
GRANT ALL ON public.calendar_settings TO service_role;

ALTER TABLE public.calendar_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calendar_settings_select_authenticated"
  ON public.calendar_settings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "calendar_settings_update_staff"
  ON public.calendar_settings FOR UPDATE TO authenticated
  USING (public.auth_is_admin() OR public.auth_user_role() IN ('seller', 'coordinator'))
  WITH CHECK (public.auth_is_admin() OR public.auth_user_role() IN ('seller', 'coordinator'));

INSERT INTO public.calendar_settings (id, popup_enabled) VALUES (true, true) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.calendar_record_fetch(_user_name text, _client text, _user_agent text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.calendar_connections (user_name, last_fetched_at, last_client, last_user_agent, fetch_count, updated_at)
  VALUES (_user_name, now(), _client, left(coalesce(_user_agent, ''), 200), 1, now())
  ON CONFLICT (user_name) DO UPDATE SET
    last_fetched_at = now(),
    last_client = excluded.last_client,
    last_user_agent = excluded.last_user_agent,
    fetch_count = public.calendar_connections.fetch_count + 1,
    updated_at = now();
$$;

CREATE OR REPLACE FUNCTION public.calendar_record_guide_sent(_user_name text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.calendar_connections (user_name, guide_sent_at, guide_sent_count, updated_at)
  VALUES (_user_name, now(), 1, now())
  ON CONFLICT (user_name) DO UPDATE SET
    guide_sent_at = now(),
    guide_sent_count = public.calendar_connections.guide_sent_count + 1,
    updated_at = now();
$$;

REVOKE ALL ON FUNCTION public.calendar_record_fetch(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.calendar_record_guide_sent(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calendar_record_fetch(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.calendar_record_guide_sent(text) TO service_role;