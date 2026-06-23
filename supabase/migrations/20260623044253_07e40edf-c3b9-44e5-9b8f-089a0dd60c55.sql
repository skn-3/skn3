
-- ============================================================
-- GRUPP D – Lägg till scopad läsåtkomst för montörer
-- ============================================================

-- PUNKT 1: A-orders – montör får läsa orders för EGET team
-- Scopning: antingen via case_id (auth_is_my_team_case) eller via team_id som matchar
-- montörens egen team-rad (montor_teams.name = auth_user_name()).
CREATE POLICY "Installer reads own team a_orders"
ON public.a_orders
FOR SELECT
TO authenticated
USING (
  auth_user_role() = 'installer'
  AND (
    (case_id IS NOT NULL AND public.auth_is_my_team_case(case_id))
    OR (
      team_id IS NOT NULL
      AND team_id IN (
        SELECT id FROM public.montor_teams WHERE name = public.auth_user_name()
      )
    )
  )
);

-- PUNKT 2: montor_teams – montör får läsa SIN EGEN team-rad
CREATE POLICY "Installer reads own team row"
ON public.montor_teams
FOR SELECT
TO authenticated
USING (
  auth_user_role() = 'installer'
  AND name = public.auth_user_name()
);
