ALTER POLICY "calendar_settings_select_authenticated"
  ON public.calendar_settings
  USING (public.auth_is_admin() OR public.auth_user_role() IN ('montor', 'seller', 'coordinator'));