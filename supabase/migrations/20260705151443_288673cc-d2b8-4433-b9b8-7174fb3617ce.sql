-- 1. Rensa de för breda / "always true"-policyerna
DROP POLICY IF EXISTS "ci_update_authenticated_upsert" ON storage.objects;
DROP POLICY IF EXISTS "sms_select_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "sms_insert_authenticated" ON storage.objects;

-- 2. Scoped SELECT/INSERT för sheet-metal-sketches (staff endast, samma modell som case-images)
CREATE POLICY "sms_select_staff"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'sheet-metal-sketches'
  AND (
    public.auth_is_admin()
    OR public.auth_user_role() IN ('seller','coordinator')
  )
);

CREATE POLICY "sms_insert_staff"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'sheet-metal-sketches'
  AND (
    public.auth_is_admin()
    OR public.auth_user_role() IN ('seller','coordinator')
  )
);

-- 3. Lås SECURITY DEFINER-funktioner som INTE ska anropas av inloggade användare
REVOKE EXECUTE ON FUNCTION public.fix_a_order_sequence() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_montor_debit_number() FROM PUBLIC, anon, authenticated;