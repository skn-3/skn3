-- Montörer kan ersätta (upsert) bilder i sina egna ärendemappar i case-images, med samma
-- ärendemappsvillkor som case_images_insert_scoped. Personal har redan ci_sms_update_staff.
DROP POLICY IF EXISTS case_images_update_montor ON storage.objects;
CREATE POLICY case_images_update_montor ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'case-images'
    AND public.auth_user_role() = 'montor'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
    AND public.auth_is_my_team_case(((storage.foldername(name))[1])::uuid)
  )
  WITH CHECK (
    bucket_id = 'case-images'
    AND public.auth_user_role() = 'montor'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
    AND public.auth_is_my_team_case(((storage.foldername(name))[1])::uuid)
  );