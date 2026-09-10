DROP POLICY IF EXISTS "Installer reads own team a_order pdfs" ON storage.objects;
CREATE POLICY "Installer reads own team a_order pdfs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'case-documents'
  AND public.auth_user_role() = 'installer'
  AND (
    EXISTS (
      SELECT 1 FROM public.a_orders o
      JOIN public.montor_teams t ON t.id = o.team_id
      WHERE o.pdf_path = storage.objects.name
        AND t.name = public.auth_user_name()
    )
    OR EXISTS (
      SELECT 1 FROM public.montor_debit_invoices d
      JOIN public.montor_teams t ON t.id = d.team_id
      WHERE d.pdf_path = storage.objects.name
        AND t.name = public.auth_user_name()
    )
  )
);

DROP POLICY IF EXISTS "Installer reads own team debit invoices" ON public.montor_debit_invoices;
CREATE POLICY "Installer reads own team debit invoices"
ON public.montor_debit_invoices
FOR SELECT
TO authenticated
USING (
  public.auth_user_role() = 'installer'
  AND team_id IN (
    SELECT id FROM public.montor_teams WHERE name = public.auth_user_name()
  )
);