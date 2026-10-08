-- Montör ser bara sitt eget teams A-ordrar (tidigare även andra teams ordrar på samma ärende)
DROP POLICY IF EXISTS "Installer reads own team a_orders" ON public.a_orders;
CREATE POLICY "Installer reads own team a_orders" ON public.a_orders
  FOR SELECT TO authenticated
  USING (
    public.auth_user_role() = 'installer'
    AND team_id IS NOT NULL
    AND team_id IN (SELECT id FROM public.montor_teams WHERE name = public.auth_user_name())
  );

-- Montör får öppna A-order-PDF, faktura-PDF och kreditfaktura-PDF för sitt teams ordrar (deterministiska sökvägar)
DROP POLICY IF EXISTS "Installer reads own team a_order pdfs" ON storage.objects;
CREATE POLICY "Installer reads own team a_order pdfs" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'case-documents'
    AND public.auth_user_role() = 'installer'
    AND (
      EXISTS (
        SELECT 1 FROM public.a_orders o JOIN public.montor_teams t ON t.id = o.team_id
        WHERE t.name = public.auth_user_name()
          AND objects.name IN (o.pdf_path, 'a-orders/' || o.id::text || '.pdf', 'a-orders/' || o.id::text || '-faktura.pdf', 'a-orders/' || o.id::text || '-kredit.pdf')
      )
      OR EXISTS (
        SELECT 1 FROM public.montor_debit_invoices d JOIN public.montor_teams t ON t.id = d.team_id
        WHERE d.pdf_path = objects.name AND t.name = public.auth_user_name()
      )
    )
  );