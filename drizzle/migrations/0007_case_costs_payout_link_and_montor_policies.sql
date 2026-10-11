-- 1) Koppling kostnad ↔ A-order/faktura (se src/lib/caseCostPayout.ts)
ALTER TABLE public.case_costs
  ADD COLUMN IF NOT EXISTS a_order_id uuid REFERENCES public.a_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS a_order_line_id text,
  ADD COLUMN IF NOT EXISTS payout_excluded_at timestamptz,
  ADD COLUMN IF NOT EXISTS payout_excluded_by text;
CREATE INDEX IF NOT EXISTS case_costs_a_order_id_idx ON public.case_costs (a_order_id);
CREATE INDEX IF NOT EXISTS case_costs_pending_idx ON public.case_costs (case_id) WHERE a_order_id IS NULL AND payout_excluded_at IS NULL;

-- 2) Rollnamnet i user_roles är 'montor'. Sex policyer skrevs mot 'installer' och har därför aldrig
--    släppt igenom någon montör (A-ordrar, eget team, debetfakturor, PDF:er, ärendebilder).
ALTER POLICY "Installer reads own team a_orders" ON public.a_orders
  USING (
    public.auth_user_role() = 'montor'
    AND team_id IS NOT NULL
    AND team_id IN (SELECT id FROM public.montor_teams WHERE name = public.auth_user_name())
  );

ALTER POLICY "Installer reads own team row" ON public.montor_teams
  USING (public.auth_user_role() = 'montor' AND name = public.auth_user_name());

ALTER POLICY "Installer reads own team debit invoices" ON public.montor_debit_invoices
  USING (
    public.auth_user_role() = 'montor'
    AND team_id IN (SELECT id FROM public.montor_teams WHERE name = public.auth_user_name())
  );

ALTER POLICY "Installer reads own team a_order pdfs" ON storage.objects
  USING (
    bucket_id = 'case-documents'
    AND public.auth_user_role() = 'montor'
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

ALTER POLICY "case_images_select_scoped" ON storage.objects
  USING (
    bucket_id = 'case-images'
    AND (
      public.auth_is_admin()
      OR public.auth_user_role() = ANY (ARRAY['seller'::text, 'coordinator'::text])
      OR (
        public.auth_user_role() = 'montor'
        AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
        AND public.auth_is_my_team_case(((storage.foldername(name))[1])::uuid)
      )
    )
  );

ALTER POLICY "case_images_insert_scoped" ON storage.objects
  WITH CHECK (
    bucket_id = 'case-images'
    AND (
      public.auth_is_admin()
      OR public.auth_user_role() = ANY (ARRAY['seller'::text, 'coordinator'::text])
      OR (
        public.auth_user_role() = 'montor'
        AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
        AND public.auth_is_my_team_case(((storage.foldername(name))[1])::uuid)
      )
    )
  );

-- 3) Montören saknade INSERT-policy på case_costs → "Lägg till kostnad" i montörvyn avvisades av RLS.
DROP POLICY IF EXISTS case_costs_montor_insert ON public.case_costs;
CREATE POLICY case_costs_montor_insert ON public.case_costs
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_user_role() = 'montor' AND public.auth_is_my_team_case(case_id));

-- 4) Montören får inte själv styra kopplingen till A-order (det är säljarens/koordinatorns beslut).
CREATE OR REPLACE FUNCTION public.case_costs_protect_payout_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.auth_user_role() = 'montor' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.a_order_id := NULL;
      NEW.a_order_line_id := NULL;
      NEW.payout_excluded_at := NULL;
      NEW.payout_excluded_by := NULL;
    ELSIF NEW.a_order_id IS DISTINCT FROM OLD.a_order_id
       OR NEW.a_order_line_id IS DISTINCT FROM OLD.a_order_line_id
       OR NEW.payout_excluded_at IS DISTINCT FROM OLD.payout_excluded_at
       OR NEW.payout_excluded_by IS DISTINCT FROM OLD.payout_excluded_by THEN
      RAISE EXCEPTION 'Kopplingen till A-order ändras av kontoret';
    ELSIF OLD.a_order_id IS NOT NULL
       AND (NEW.amount IS DISTINCT FROM OLD.amount OR NEW.description IS DISTINCT FROM OLD.description) THEN
      RAISE EXCEPTION 'Kostnaden ligger redan på en A-order — kontakta kontoret för ändring';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS case_costs_protect_payout_fields ON public.case_costs;
CREATE TRIGGER case_costs_protect_payout_fields
  BEFORE INSERT OR UPDATE ON public.case_costs
  FOR EACH ROW EXECUTE FUNCTION public.case_costs_protect_payout_fields();