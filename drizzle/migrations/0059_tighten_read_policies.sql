-- ai_settings: alla med en roll i appen (montörens röstknapp läser voice_enabled)
DROP POLICY IF EXISTS ai_settings_read ON public.ai_settings;
CREATE POLICY ai_settings_read ON public.ai_settings FOR SELECT TO authenticated
  USING (auth_is_admin() OR auth_user_role() IS NOT NULL);

-- case_climate_compensation: bara personal (innehåller kundernas hämtlänkar)
DROP POLICY IF EXISTS "auth read case climate" ON public.case_climate_compensation;
CREATE POLICY "staff read case climate" ON public.case_climate_compensation FOR SELECT TO authenticated
  USING (auth_is_admin() OR auth_user_role() = ANY (ARRAY['seller'::text, 'coordinator'::text]));

-- climate_events: bara personal
DROP POLICY IF EXISTS "climate_events read" ON public.climate_events;
CREATE POLICY "staff read climate events" ON public.climate_events FOR SELECT TO authenticated
  USING (auth_is_admin() OR auth_user_role() = ANY (ARRAY['seller'::text, 'coordinator'::text]));

-- order_climate_compensation: läses inte av någon kod, bara admin
DROP POLICY IF EXISTS "auth read climate" ON public.order_climate_compensation;
CREATE POLICY "admin read climate" ON public.order_climate_compensation FOR SELECT TO authenticated
  USING (auth_is_admin());

-- knowledge_sources: samma villkor som knowledge_chunks_read
DROP POLICY IF EXISTS knowledge_sources_read ON public.knowledge_sources;
CREATE POLICY knowledge_sources_read ON public.knowledge_sources FOR SELECT TO authenticated
  USING (enabled AND (audience = 'all' OR audience = auth_user_role() OR auth_is_admin() OR auth_user_role() = 'coordinator'));