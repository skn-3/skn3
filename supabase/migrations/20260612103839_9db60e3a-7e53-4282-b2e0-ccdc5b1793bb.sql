
DROP POLICY IF EXISTS "log_insert" ON public.activity_log;
CREATE POLICY "log_insert" ON public.activity_log
  FOR INSERT TO authenticated
  WITH CHECK (actor_name = public.auth_user_name());

DROP POLICY IF EXISTS user_roles_no_insert ON public.user_roles;
CREATE POLICY user_roles_no_insert ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS user_roles_no_update ON public.user_roles;
CREATE POLICY user_roles_no_update ON public.user_roles
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS user_roles_no_delete ON public.user_roles;
CREATE POLICY user_roles_no_delete ON public.user_roles
  FOR DELETE TO authenticated USING (false);
