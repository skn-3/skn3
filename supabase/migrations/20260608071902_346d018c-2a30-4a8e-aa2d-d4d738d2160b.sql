
-- 1. profiles SELECT: own row + admin
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Profiles readable by all authenticated" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin"
ON public.profiles FOR SELECT
TO authenticated
USING (id = auth.uid() OR public.auth_is_admin());

-- 2. profiles UPDATE: own row, but role/is_admin protected via trigger
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid() OR public.auth_is_admin())
WITH CHECK (id = auth.uid() OR public.auth_is_admin());

CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.is_admin IS DISTINCT FROM OLD.is_admin)
     AND NOT public.auth_is_admin() THEN
    RAISE EXCEPTION 'Not allowed to change role or admin status';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();

-- 3. user_calendar_tokens: owner-only write with check
DROP POLICY IF EXISTS "cal_own_select" ON public.user_calendar_tokens;
DROP POLICY IF EXISTS "cal_own_write" ON public.user_calendar_tokens;

CREATE POLICY "cal_own_select"
ON public.user_calendar_tokens FOR SELECT
TO authenticated
USING (user_name = public.auth_user_name());

CREATE POLICY "cal_own_insert"
ON public.user_calendar_tokens FOR INSERT
TO authenticated
WITH CHECK (user_name = public.auth_user_name());

CREATE POLICY "cal_own_update"
ON public.user_calendar_tokens FOR UPDATE
TO authenticated
USING (user_name = public.auth_user_name())
WITH CHECK (user_name = public.auth_user_name());

CREATE POLICY "cal_own_delete"
ON public.user_calendar_tokens FOR DELETE
TO authenticated
USING (user_name = public.auth_user_name());

-- 4. Lock down SECURITY DEFINER helper functions
REVOKE EXECUTE ON FUNCTION public.auth_is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auth_user_name() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auth_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_name() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_role() TO authenticated;
