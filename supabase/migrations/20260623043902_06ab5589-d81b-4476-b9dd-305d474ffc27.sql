
-- ====================================================================
-- GRUPP C – Säkerhetshärdning (behörighetsglapp)
-- ====================================================================

-- ---------- PUNKT 3: case-images storage scoping ----------
-- Tidigare lät vi alla authenticated läsa/skriva. Skärper:
--  • Personal (admin/seller/coordinator): bred åtkomst till båda buckets.
--  • Montör: bara objekt vars första path-segment = case_id som ingår i deras team.
-- sheet-metal-sketches behåller "authenticated"-läge (utanför scope).

DROP POLICY IF EXISTS ci_sms_select_authenticated ON storage.objects;
DROP POLICY IF EXISTS ci_sms_insert_authenticated ON storage.objects;

-- SELECT: case-images — personal allt, montör endast eget team
CREATE POLICY "case_images_select_scoped"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'case-images'
  AND (
    public.auth_is_admin()
    OR public.auth_user_role() IN ('seller','coordinator')
    OR (
      public.auth_user_role() = 'installer'
      AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
      AND public.auth_is_my_team_case(((storage.foldername(name))[1])::uuid)
    )
  )
);

-- INSERT: case-images — samma regler
CREATE POLICY "case_images_insert_scoped"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'case-images'
  AND (
    public.auth_is_admin()
    OR public.auth_user_role() IN ('seller','coordinator')
    OR (
      public.auth_user_role() = 'installer'
      AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
      AND public.auth_is_my_team_case(((storage.foldername(name))[1])::uuid)
    )
  )
);

-- sheet-metal-sketches: behåll tidigare beteende (authenticated read/insert)
CREATE POLICY "sms_select_authenticated"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'sheet-metal-sketches');

CREATE POLICY "sms_insert_authenticated"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'sheet-metal-sketches');

-- ---------- PUNKT 4: SECURITY DEFINER – återkalla från PUBLIC/anon ----------
-- set_montor_debit_number är en trigger; den körs som tabellägaren oavsett grants.
-- Säkert att återkalla EXECUTE från public/anon.
REVOKE EXECUTE ON FUNCTION public.set_montor_debit_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_montor_debit_number() FROM anon;

-- ---------- PUNKT 5: SECURITY DEFINER – inloggade ----------
-- auth_is_admin, auth_user_name, auth_user_role, auth_is_my_team_case används av RLS-policys
-- i den inloggade användarens kontext → MÅSTE behålla authenticated EXECUTE.
-- De returnerar bara info om auth.uid() (förutom auth_is_my_team_case som tar case_id och
-- returnerar bool om aktuellt team matchar – inte angriparstyrd dataläcka).
-- INGEN ändring för dessa.
--
-- fix_a_order_sequence är admin-underhåll, inte RLS-beroende. Säkert att låsa till service_role.
REVOKE EXECUTE ON FUNCTION public.fix_a_order_sequence() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fix_a_order_sequence() FROM anon;
REVOKE EXECUTE ON FUNCTION public.fix_a_order_sequence() FROM authenticated;
