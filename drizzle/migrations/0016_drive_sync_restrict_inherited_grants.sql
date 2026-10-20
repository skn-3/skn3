REVOKE ALL ON public.drive_sync FROM anon, authenticated;
GRANT SELECT ON public.drive_sync TO authenticated;
GRANT ALL ON public.drive_sync TO service_role;
REVOKE ALL ON public.drive_sync_settings FROM anon, authenticated;
GRANT SELECT ON public.drive_sync_settings TO authenticated;
GRANT UPDATE(enabled,root_folder_id,kunder_folder_id) ON public.drive_sync_settings TO authenticated;
GRANT ALL ON public.drive_sync_settings TO service_role;
REVOKE ALL ON public.drive_sync_runtime FROM anon, authenticated;
GRANT ALL ON public.drive_sync_runtime TO service_role;