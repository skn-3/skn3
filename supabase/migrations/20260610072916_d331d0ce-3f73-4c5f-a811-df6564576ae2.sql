
-- 1. Helper function
CREATE OR REPLACE FUNCTION public.auth_is_my_team_case(p_case_id uuid) RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cases
    WHERE id = p_case_id
      AND (team = public.auth_user_name() OR km_team = public.auth_user_name())
  )
$$;
REVOKE EXECUTE ON FUNCTION public.auth_is_my_team_case(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auth_is_my_team_case(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.auth_is_my_team_case(uuid) TO authenticated;

-- 2. Drop blanket policies
DROP POLICY IF EXISTS "cases_auth_all" ON public.cases;
DROP POLICY IF EXISTS "case_events_auth_all" ON public.case_events;
DROP POLICY IF EXISTS "visits_auth_all" ON public.visits;
DROP POLICY IF EXISTS "case_costs_auth_all" ON public.case_costs;
DROP POLICY IF EXISTS "deviations_auth_all" ON public.deviations;
DROP POLICY IF EXISTS "sheet_metal_orders_auth_all" ON public.sheet_metal_orders;
DROP POLICY IF EXISTS "insight_history_auth_all" ON public.insight_history;

-- 3. New policies

-- cases
CREATE POLICY "cases_staff_all" ON public.cases FOR ALL TO authenticated
  USING (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator'))
  WITH CHECK (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator'));
CREATE POLICY "cases_montor_select" ON public.cases FOR SELECT TO authenticated
  USING (public.auth_user_role() = 'montor'
         AND (team = public.auth_user_name() OR km_team = public.auth_user_name()));
CREATE POLICY "cases_montor_update" ON public.cases FOR UPDATE TO authenticated
  USING (public.auth_user_role() = 'montor'
         AND (team = public.auth_user_name() OR km_team = public.auth_user_name()))
  WITH CHECK (public.auth_user_role() = 'montor'
         AND (team = public.auth_user_name() OR km_team = public.auth_user_name()));

-- case_events
CREATE POLICY "case_events_staff_all" ON public.case_events FOR ALL TO authenticated
  USING (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator'))
  WITH CHECK (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator'));
CREATE POLICY "case_events_montor_select" ON public.case_events FOR SELECT TO authenticated
  USING (public.auth_user_role() = 'montor' AND public.auth_is_my_team_case(case_id));
CREATE POLICY "case_events_montor_insert" ON public.case_events FOR INSERT TO authenticated
  WITH CHECK (public.auth_user_role() = 'montor' AND public.auth_is_my_team_case(case_id));

-- case_costs
CREATE POLICY "case_costs_staff_all" ON public.case_costs FOR ALL TO authenticated
  USING (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator'))
  WITH CHECK (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator'));
CREATE POLICY "case_costs_montor_select" ON public.case_costs FOR SELECT TO authenticated
  USING (public.auth_user_role() = 'montor' AND public.auth_is_my_team_case(case_id));
CREATE POLICY "case_costs_montor_update" ON public.case_costs FOR UPDATE TO authenticated
  USING (public.auth_user_role() = 'montor' AND public.auth_is_my_team_case(case_id))
  WITH CHECK (public.auth_user_role() = 'montor' AND public.auth_is_my_team_case(case_id));

-- deviations
CREATE POLICY "deviations_staff_all" ON public.deviations FOR ALL TO authenticated
  USING (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator'))
  WITH CHECK (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator'));
CREATE POLICY "deviations_montor_select" ON public.deviations FOR SELECT TO authenticated
  USING (public.auth_user_role() = 'montor' AND public.auth_is_my_team_case(case_id));
CREATE POLICY "deviations_montor_insert" ON public.deviations FOR INSERT TO authenticated
  WITH CHECK (public.auth_user_role() = 'montor' AND public.auth_is_my_team_case(case_id));
CREATE POLICY "deviations_montor_update" ON public.deviations FOR UPDATE TO authenticated
  USING (public.auth_user_role() = 'montor' AND public.auth_is_my_team_case(case_id))
  WITH CHECK (public.auth_user_role() = 'montor' AND public.auth_is_my_team_case(case_id));

-- sheet_metal_orders
CREATE POLICY "sheet_metal_orders_staff_all" ON public.sheet_metal_orders FOR ALL TO authenticated
  USING (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator'))
  WITH CHECK (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator'));
CREATE POLICY "sheet_metal_orders_montor_select" ON public.sheet_metal_orders FOR SELECT TO authenticated
  USING (public.auth_user_role() = 'montor' AND public.auth_is_my_team_case(case_id));
CREATE POLICY "sheet_metal_orders_montor_insert" ON public.sheet_metal_orders FOR INSERT TO authenticated
  WITH CHECK (public.auth_user_role() = 'montor' AND public.auth_is_my_team_case(case_id));

-- visits (staff only)
CREATE POLICY "visits_staff_all" ON public.visits FOR ALL TO authenticated
  USING (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator'))
  WITH CHECK (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator'));

-- insight_history (staff only)
CREATE POLICY "insight_history_staff_all" ON public.insight_history FOR ALL TO authenticated
  USING (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator'))
  WITH CHECK (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator'));

-- 4. Lock down trigger functions
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.set_deviation_resolved_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_deviation_resolved_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_deviation_resolved_at() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.set_offer_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_offer_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_offer_number() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.set_uppdrag_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_uppdrag_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_uppdrag_number() FROM authenticated;
