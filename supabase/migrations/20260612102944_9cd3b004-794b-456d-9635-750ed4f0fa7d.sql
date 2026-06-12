
-- ═══ DEL 1: user_roles — eliminera skrivvägar ═══
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.user_roles FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.user_roles FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.user_roles FROM authenticated;

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- Drop any write policies if present (idempotent guard)
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='user_roles'
      AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_roles', p.policyname);
  END LOOP;
END$$;

-- ═══ DEL 2: Storage policies for case-images & sheet-metal-sketches ═══
-- Drop any existing policies that reference these two buckets
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND (qual ILIKE '%case-images%' OR qual ILIKE '%sheet-metal-sketches%'
           OR with_check ILIKE '%case-images%' OR with_check ILIKE '%sheet-metal-sketches%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', p.policyname);
  END LOOP;
END$$;

-- SELECT: all authenticated
CREATE POLICY "ci_sms_select_authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('case-images','sheet-metal-sketches'));

-- INSERT: all authenticated
CREATE POLICY "ci_sms_insert_authenticated"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('case-images','sheet-metal-sketches'));

-- UPDATE: authenticated for case-images only (upsert needed in uploadDeviationImages / receipts)
CREATE POLICY "ci_update_authenticated_upsert"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'case-images')
  WITH CHECK (bucket_id = 'case-images');

-- UPDATE: staff for both buckets
CREATE POLICY "ci_sms_update_staff"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('case-images','sheet-metal-sketches')
    AND (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator'))
  )
  WITH CHECK (
    bucket_id IN ('case-images','sheet-metal-sketches')
    AND (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator'))
  );

-- DELETE: staff only
CREATE POLICY "ci_sms_delete_staff"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id IN ('case-images','sheet-metal-sketches')
    AND (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator'))
  );
