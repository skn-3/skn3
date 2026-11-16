-- Avdrag på montörsutbetalningar (avräkning), beslut 16 november 2026.
-- Additiv: nya kolumner, tabeller, funktioner och spärrar. Inga befintliga rader ändras.

-- 1. Avdragstyper och moms på debetfakturor ------------------------------------------
ALTER TABLE public.montor_debit_invoices
  ADD COLUMN IF NOT EXISTS debit_type text,
  ADD COLUMN IF NOT EXISTS settle_mode text NOT NULL DEFAULT 'bankgiro',
  ADD COLUMN IF NOT EXISTS attachment_path text,
  ADD COLUMN IF NOT EXISTS attachment_name text;

ALTER TABLE public.montor_debit_invoices DROP CONSTRAINT IF EXISTS montor_debit_invoices_vat_mode_check;
ALTER TABLE public.montor_debit_invoices ADD CONSTRAINT montor_debit_invoices_vat_mode_check
  CHECK (vat_mode IN ('omvand', 'vanlig', 'ingen'));
ALTER TABLE public.montor_debit_invoices ADD CONSTRAINT montor_debit_invoices_debit_type_check
  CHECK (debit_type IS NULL OR debit_type IN ('skada_merkostnad', 'material_frakt', 'lan_forskott', 'byggtjanst'));
-- Typen styr momsen (samma regel som DEBIT_TYPES i src/lib/montorSettlement.ts).
ALTER TABLE public.montor_debit_invoices ADD CONSTRAINT montor_debit_invoices_debit_type_vat_check
  CHECK (
    debit_type IS NULL
    OR (debit_type IN ('skada_merkostnad', 'lan_forskott') AND vat_mode = 'ingen')
    OR (debit_type = 'material_frakt' AND vat_mode = 'vanlig')
    OR (debit_type = 'byggtjanst' AND vat_mode = 'omvand')
  );
ALTER TABLE public.montor_debit_invoices ADD CONSTRAINT montor_debit_invoices_settle_mode_check
  CHECK (settle_mode IN ('bankgiro', 'avrakning'));
ALTER TABLE public.montor_debit_invoices ADD CONSTRAINT montor_debit_invoices_settle_mode_kind_check
  CHECK (settle_mode = 'bankgiro' OR kind = 'debit');

COMMENT ON COLUMN public.montor_debit_invoices.debit_type IS 'Avdragstyp för kind=debit: skada_merkostnad, material_frakt, lan_forskott, byggtjanst. Styr momsen. Null för äldre rader.';
COMMENT ON COLUMN public.montor_debit_invoices.settle_mode IS 'bankgiro = montören betalar till vårt bankgiro, avrakning = kvittas mot nästa utbetalning (montor_settlements).';
COMMENT ON COLUMN public.montor_debit_invoices.attachment_path IS 'Valfritt underlag (kvitto/PDF/bild) i privata case-documents; bifogas mejlet.';

-- 2. Utbetalningsspecifikationer --------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.montor_settlement_seq START 1 NO CYCLE;

CREATE TABLE public.montor_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_number text UNIQUE,
  team_id uuid NOT NULL REFERENCES public.montor_teams(id),
  settlement_date date NOT NULL DEFAULT CURRENT_DATE,
  company_name text,
  org_nr text,
  bankgiro text,
  address text,
  invoices_total numeric NOT NULL DEFAULT 0,
  credits_total numeric NOT NULL DEFAULT 0,
  deductions_total numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'sent', 'paid', 'cancelled')),
  pdf_path text,
  sent_at timestamptz,
  sent_to jsonb,
  paid_at date,
  paid_by text,
  cancelled_at timestamptz,
  cancelled_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  note text,
  CONSTRAINT montor_settlements_net_check CHECK (net_amount >= 0 AND net_amount = invoices_total - credits_total - deductions_total),
  CONSTRAINT montor_settlements_totals_check CHECK (invoices_total >= 0 AND credits_total >= 0 AND deductions_total >= 0)
);
COMMENT ON TABLE public.montor_settlements IS 'Utbetalningsspecifikationer (UTB-serien): självfakturor som betalas minus kreditfakturor och kvittade fordringar. Ingen faktura. Belopp skrivs bara av create_montor_settlement.';
COMMENT ON COLUMN public.montor_settlements.credits_total IS 'Avgår kreditfakturor, positivt belopp.';
COMMENT ON COLUMN public.montor_settlements.deductions_total IS 'Avgår kvittade fordringar, positivt belopp.';

GRANT SELECT ON public.montor_settlements TO authenticated;
GRANT ALL ON public.montor_settlements TO service_role;
ALTER TABLE public.montor_settlements ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.montor_settlement_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES public.montor_settlements(id) ON DELETE CASCADE,
  item_kind text NOT NULL CHECK (item_kind IN ('invoice', 'self_billing_invoice', 'credit_note', 'deduction')),
  a_order_id uuid REFERENCES public.a_orders(id),
  debit_invoice_id uuid REFERENCES public.montor_debit_invoices(id),
  document_number text,
  label text,
  document_date date,
  amount numeric NOT NULL,
  document_total numeric NOT NULL,
  remaining_after numeric,
  active boolean NOT NULL DEFAULT true,
  set_paid_at boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT montor_settlement_items_source_check CHECK ((a_order_id IS NULL) <> (debit_invoice_id IS NULL)),
  CONSTRAINT montor_settlement_items_kind_source_check CHECK (
    (item_kind = 'invoice' AND a_order_id IS NOT NULL)
    OR (item_kind IN ('self_billing_invoice', 'deduction') AND debit_invoice_id IS NOT NULL)
    OR item_kind = 'credit_note'
  ),
  CONSTRAINT montor_settlement_items_sign_check CHECK (
    (item_kind IN ('invoice', 'self_billing_invoice') AND amount > 0)
    OR (item_kind IN ('credit_note', 'deduction') AND amount < 0)
  )
);
COMMENT ON TABLE public.montor_settlement_items IS 'Rader i en utbetalningsspecifikation. amount: positivt för fakturor, negativt för krediter och avdrag. document_total: dokumentets hela belopp (delkvittning).';

CREATE INDEX montor_settlement_items_settlement_idx ON public.montor_settlement_items(settlement_id);
CREATE INDEX montor_settlement_items_debit_idx ON public.montor_settlement_items(debit_invoice_id) WHERE debit_invoice_id IS NOT NULL;
-- En faktura eller kreditfaktura kan bara finnas i en aktiv specifikation.
CREATE UNIQUE INDEX montor_settlement_items_one_active_a_order ON public.montor_settlement_items(a_order_id) WHERE active AND a_order_id IS NOT NULL;
CREATE UNIQUE INDEX montor_settlement_items_one_active_debit_doc ON public.montor_settlement_items(debit_invoice_id) WHERE active AND debit_invoice_id IS NOT NULL AND item_kind <> 'deduction';

GRANT SELECT ON public.montor_settlement_items TO authenticated;
GRANT ALL ON public.montor_settlement_items TO service_role;
ALTER TABLE public.montor_settlement_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY montor_settlements_staff_read ON public.montor_settlements FOR SELECT TO authenticated
  USING (public.auth_is_admin() OR public.auth_user_role() IN ('seller', 'coordinator'));
CREATE POLICY montor_settlements_installer_read ON public.montor_settlements FOR SELECT TO authenticated
  USING (
    public.auth_user_role() = 'montor'
    AND status IN ('sent', 'paid')
    AND team_id IN (SELECT t.id FROM public.montor_teams t WHERE t.name = public.auth_user_name())
  );
CREATE POLICY montor_settlement_items_staff_read ON public.montor_settlement_items FOR SELECT TO authenticated
  USING (public.auth_is_admin() OR public.auth_user_role() IN ('seller', 'coordinator'));
CREATE POLICY montor_settlement_items_installer_read ON public.montor_settlement_items FOR SELECT TO authenticated
  USING (
    public.auth_user_role() = 'montor'
    AND EXISTS (
      SELECT 1 FROM public.montor_settlements s
      JOIN public.montor_teams t ON t.id = s.team_id
      WHERE s.id = montor_settlement_items.settlement_id
        AND s.status IN ('sent', 'paid')
        AND t.name = public.auth_user_name()
    )
  );

-- 3. Nummer UTB-001, UTB-002 … (sekvensen återanvänds aldrig och nollställs inte) ------
CREATE OR REPLACE FUNCTION public.set_montor_settlement_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n bigint;
BEGIN
  v_n := nextval('public.montor_settlement_seq');
  NEW.settlement_number := 'UTB-' || CASE WHEN v_n < 1000 THEN lpad(v_n::text, 3, '0') ELSE v_n::text END;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_set_montor_settlement_number BEFORE INSERT ON public.montor_settlements
  FOR EACH ROW EXECUTE FUNCTION public.set_montor_settlement_number();

-- 4. Spärr: aktiva kvittningar av en debetfaktura får aldrig överstiga dess total -------
CREATE OR REPLACE FUNCTION public.montor_settlement_items_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total numeric; v_used numeric; v_nr text;
BEGIN
  IF NEW.item_kind = 'deduction' AND NEW.active THEN
    SELECT total, invoice_number INTO v_total, v_nr FROM public.montor_debit_invoices WHERE id = NEW.debit_invoice_id FOR UPDATE;
    SELECT COALESCE(sum(abs(amount)), 0) INTO v_used FROM public.montor_settlement_items
      WHERE debit_invoice_id = NEW.debit_invoice_id AND item_kind = 'deduction' AND active AND id <> NEW.id;
    IF v_used + abs(NEW.amount) > COALESCE(v_total, 0) THEN
      RAISE EXCEPTION 'Fordran % kvittas med mer än sitt belopp', v_nr USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_montor_settlement_items_guard BEFORE INSERT OR UPDATE ON public.montor_settlement_items
  FOR EACH ROW EXECUTE FUNCTION public.montor_settlement_items_guard();

-- 5. Spärrar på fakturorna: betalning och kreditering av dokument i en aktiv specifikation
CREATE OR REPLACE FUNCTION public.montor_settlement_source_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nr text; v_kind text;
BEGIN
  IF current_setting('app.montor_settlement_op', true) = 'on' THEN RETURN NEW; END IF;

  IF TG_TABLE_NAME = 'a_orders' THEN
    IF TG_OP = 'UPDATE' AND NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
      SELECT s.settlement_number INTO v_nr FROM public.montor_settlement_items i
        JOIN public.montor_settlements s ON s.id = i.settlement_id
        WHERE i.a_order_id = NEW.id AND i.active LIMIT 1;
      IF v_nr IS NOT NULL THEN
        RAISE EXCEPTION 'Fakturan ingår i % – betalningen markeras på utbetalningen', v_nr USING ERRCODE = 'P0001';
      END IF;
    ELSIF TG_OP = 'INSERT' AND NEW.credited_from_order_id IS NOT NULL THEN
      SELECT s.settlement_number INTO v_nr FROM public.montor_settlement_items i
        JOIN public.montor_settlements s ON s.id = i.settlement_id
        WHERE i.a_order_id = NEW.credited_from_order_id AND i.active AND s.status IN ('created', 'sent') LIMIT 1;
      IF v_nr IS NOT NULL THEN
        RAISE EXCEPTION 'Fakturan ingår i % som inte är betald – makulera utbetalningen innan du krediterar', v_nr USING ERRCODE = 'P0001';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'montor_debit_invoices' THEN
    IF TG_OP = 'UPDATE' AND (NEW.paid_at IS DISTINCT FROM OLD.paid_at OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'credited')) THEN
      SELECT s.settlement_number INTO v_nr FROM public.montor_settlement_items i
        JOIN public.montor_settlements s ON s.id = i.settlement_id
        WHERE i.debit_invoice_id = NEW.id AND i.active LIMIT 1;
      IF v_nr IS NOT NULL THEN
        RAISE EXCEPTION 'Fakturan ingår i % – betalningen markeras på utbetalningen', v_nr USING ERRCODE = 'P0001';
      END IF;
    ELSIF TG_OP = 'INSERT' AND NEW.credited_from_invoice_id IS NOT NULL THEN
      SELECT kind INTO v_kind FROM public.montor_debit_invoices WHERE id = NEW.credited_from_invoice_id;
      SELECT s.settlement_number INTO v_nr FROM public.montor_settlement_items i
        JOIN public.montor_settlements s ON s.id = i.settlement_id
        WHERE i.debit_invoice_id = NEW.credited_from_invoice_id AND i.active
          AND (v_kind = 'debit' OR s.status IN ('created', 'sent'))
        LIMIT 1;
      IF v_nr IS NOT NULL THEN
        RAISE EXCEPTION 'Fakturan ingår i % och kan inte krediteras', v_nr USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_a_orders_settlement_guard BEFORE INSERT OR UPDATE ON public.a_orders
  FOR EACH ROW EXECUTE FUNCTION public.montor_settlement_source_guard();
CREATE TRIGGER trg_montor_debit_settlement_guard BEFORE INSERT OR UPDATE ON public.montor_debit_invoices
  FOR EACH ROW EXECUTE FUNCTION public.montor_settlement_source_guard();

-- 6. Behörighet: samma personal som skickar debetfakturor och markerar betalt (admin, koordinator)
CREATE OR REPLACE FUNCTION public.can_manage_montor_settlements()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.auth_is_admin(), false) OR COALESCE(public.auth_user_role() = 'coordinator', false)
$$;

-- 7. Skapa specifikation (källan till beloppen) ------------------------------------------
CREATE OR REPLACE FUNCTION public.create_montor_settlement(
  p_team_id uuid,
  p_invoice_ids uuid[],
  p_self_billing_ids uuid[],
  p_credit_note_ids uuid[],
  p_deduction_ids uuid[],
  p_date date DEFAULT NULL
) RETURNS public.montor_settlements
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c_cutoff constant date := DATE '2026-11-16';
  v_team public.montor_teams%ROWTYPE;
  v_s public.montor_settlements%ROWTYPE;
  v_name text := COALESCE(public.auth_user_name(), 'Okänd');
  v_date date := COALESCE(p_date, (now() AT TIME ZONE 'Europe/Stockholm')::date);
  v_inv_ids uuid[] := COALESCE(p_invoice_ids, '{}');
  v_sb_ids uuid[] := COALESCE(p_self_billing_ids, '{}');
  v_cn_ids uuid[] := COALESCE(p_credit_note_ids, '{}');
  v_ded_ids uuid[] := COALESCE(p_deduction_ids, '{}');
  v_cn_a uuid[] := '{}';
  v_cn_d uuid[] := '{}';
  v_take_ids uuid[] := '{}';
  v_take_amt numeric[] := '{}';
  v_take_rem numeric[] := '{}';
  v_inv numeric := 0;
  v_cred numeric := 0;
  v_ded numeric := 0;
  v_left numeric;
  v_id uuid;
  v_nr text;
  v_used numeric;
  v_rem numeric;
  v_take numeric;
  v_sort integer := 0;
  o record;
  d record;
  i integer;
BEGIN
  IF NOT public.can_manage_montor_settlements() THEN
    RAISE EXCEPTION 'Behörighet saknas för utbetalningar' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_team FROM public.montor_teams WHERE id = p_team_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Montörsteamet hittades inte'; END IF;
  IF COALESCE(btrim(v_team.bankgiro), '') = '' THEN
    RAISE EXCEPTION 'Teamet % saknar bankgiro – komplettera under Montörsteam', COALESCE(v_team.company_name, v_team.name);
  END IF;
  IF cardinality(v_inv_ids) + cardinality(v_sb_ids) = 0 THEN
    RAISE EXCEPTION 'Välj minst en faktura att betala';
  END IF;
  IF (SELECT count(*) <> count(DISTINCT x) FROM unnest(v_inv_ids || v_sb_ids || v_cn_ids || v_ded_ids) AS x) THEN
    RAISE EXCEPTION 'Samma dokument är valt mer än en gång';
  END IF;

  -- A. A-order-, kompletterings- och serviceorderfakturor
  FOREACH v_id IN ARRAY v_inv_ids LOOP
    SELECT * INTO o FROM public.a_orders WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Fakturan hittades inte'; END IF;
    v_nr := COALESCE(o.invoice_number, '#' || o.order_number::text);
    IF o.team_id IS DISTINCT FROM p_team_id THEN RAISE EXCEPTION 'Faktura % tillhör ett annat team', v_nr; END IF;
    IF o.status <> 'invoiced' OR o.credited_from_order_id IS NOT NULL THEN RAISE EXCEPTION 'Faktura % är inte en obetald faktura', v_nr; END IF;
    IF o.paid_at IS NOT NULL THEN RAISE EXCEPTION 'Faktura % är redan betald', v_nr; END IF;
    IF COALESCE(o.total_amount, 0) <= 0 THEN RAISE EXCEPTION 'Faktura % har inget belopp att betala', v_nr; END IF;
    IF EXISTS (SELECT 1 FROM public.a_orders c WHERE c.credited_from_order_id = o.id) THEN
      RAISE EXCEPTION 'Faktura % har en kreditfaktura', v_nr;
    END IF;
    IF EXISTS (SELECT 1 FROM public.montor_settlement_items it WHERE it.a_order_id = o.id AND it.active) THEN
      RAISE EXCEPTION 'Faktura % ingår redan i en annan utbetalning', v_nr;
    END IF;
    v_inv := v_inv + round(o.total_amount, 2);
  END LOOP;

  -- A. KM-självfakturor
  FOREACH v_id IN ARRAY v_sb_ids LOOP
    SELECT * INTO d FROM public.montor_debit_invoices WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Självfakturan hittades inte'; END IF;
    IF d.team_id IS DISTINCT FROM p_team_id THEN RAISE EXCEPTION 'Faktura % tillhör ett annat team', d.invoice_number; END IF;
    IF d.kind <> 'self_billing' OR d.credited_from_invoice_id IS NOT NULL OR d.status <> 'sent' THEN
      RAISE EXCEPTION 'Faktura % är inte en obetald självfaktura', d.invoice_number;
    END IF;
    IF d.paid_at IS NOT NULL THEN RAISE EXCEPTION 'Faktura % är redan betald', d.invoice_number; END IF;
    IF COALESCE(d.total, 0) <= 0 THEN RAISE EXCEPTION 'Faktura % har inget belopp att betala', d.invoice_number; END IF;
    IF EXISTS (SELECT 1 FROM public.montor_debit_invoices c WHERE c.credited_from_invoice_id = d.id) THEN
      RAISE EXCEPTION 'Faktura % har en kreditfaktura', d.invoice_number;
    END IF;
    IF EXISTS (SELECT 1 FROM public.montor_settlement_items it WHERE it.debit_invoice_id = d.id AND it.active) THEN
      RAISE EXCEPTION 'Faktura % ingår redan i en annan utbetalning', d.invoice_number;
    END IF;
    v_inv := v_inv + round(d.total, 2);
  END LOOP;

  -- B. Kreditfakturor (A-order eller KM) från 2026-11-16 vars original är betalt
  FOREACH v_id IN ARRAY v_cn_ids LOOP
    SELECT * INTO o FROM public.a_orders WHERE id = v_id FOR UPDATE;
    IF FOUND THEN
      IF o.team_id IS DISTINCT FROM p_team_id THEN RAISE EXCEPTION 'Kreditfaktura % tillhör ett annat team', o.invoice_number; END IF;
      IF o.credited_from_order_id IS NULL OR o.status <> 'credited' OR COALESCE(o.total_amount, 0) >= 0 THEN
        RAISE EXCEPTION 'Dokument % är ingen kreditfaktura', COALESCE(o.invoice_number, '#' || o.order_number::text);
      END IF;
      IF o.date < c_cutoff THEN RAISE EXCEPTION 'Kreditfaktura % är äldre än 2026-11-16 och kvittas inte', o.invoice_number; END IF;
      IF o.paid_at IS NOT NULL THEN RAISE EXCEPTION 'Kreditfaktura % är redan reglerad', o.invoice_number; END IF;
      IF NOT EXISTS (SELECT 1 FROM public.a_orders x WHERE x.id = o.credited_from_order_id AND x.paid_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Originalfakturan till % är inte betald', o.invoice_number;
      END IF;
      IF EXISTS (SELECT 1 FROM public.montor_settlement_items it WHERE it.a_order_id = o.id AND it.active) THEN
        RAISE EXCEPTION 'Kreditfaktura % är redan kvittad', o.invoice_number;
      END IF;
      v_cred := v_cred + round(abs(o.total_amount), 2);
      v_cn_a := v_cn_a || o.id;
    ELSE
      SELECT * INTO d FROM public.montor_debit_invoices WHERE id = v_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Kreditfakturan hittades inte'; END IF;
      IF d.team_id IS DISTINCT FROM p_team_id THEN RAISE EXCEPTION 'Kreditfaktura % tillhör ett annat team', d.invoice_number; END IF;
      IF d.kind <> 'self_billing' OR d.credited_from_invoice_id IS NULL OR COALESCE(d.total, 0) >= 0 OR d.status = 'cancelled' THEN
        RAISE EXCEPTION 'Dokument % är ingen kreditfaktura på en självfaktura', d.invoice_number;
      END IF;
      IF d.date < c_cutoff THEN RAISE EXCEPTION 'Kreditfaktura % är äldre än 2026-11-16 och kvittas inte', d.invoice_number; END IF;
      IF d.paid_at IS NOT NULL THEN RAISE EXCEPTION 'Kreditfaktura % är redan reglerad', d.invoice_number; END IF;
      IF NOT EXISTS (SELECT 1 FROM public.montor_debit_invoices x WHERE x.id = d.credited_from_invoice_id AND x.paid_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Originalfakturan till % är inte betald', d.invoice_number;
      END IF;
      IF EXISTS (SELECT 1 FROM public.montor_settlement_items it WHERE it.debit_invoice_id = d.id AND it.active) THEN
        RAISE EXCEPTION 'Kreditfaktura % är redan kvittad', d.invoice_number;
      END IF;
      v_cred := v_cred + round(abs(d.total), 2);
      v_cn_d := v_cn_d || d.id;
    END IF;
  END LOOP;

  IF v_cred > v_inv THEN
    RAISE EXCEPTION 'Kreditfakturorna (% kr) är större än fakturorna (% kr)', v_cred, v_inv;
  END IF;
  v_left := v_inv - v_cred;

  -- C. Avdrag: validera alla, fördela äldst först, aldrig mer än vad fakturorna räcker till
  FOREACH v_id IN ARRAY v_ded_ids LOOP
    SELECT * INTO d FROM public.montor_debit_invoices WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Avdraget hittades inte'; END IF;
    IF d.team_id IS DISTINCT FROM p_team_id THEN RAISE EXCEPTION 'Avdrag % tillhör ett annat team', d.invoice_number; END IF;
    IF d.kind <> 'debit' OR d.credited_from_invoice_id IS NOT NULL OR COALESCE(d.total, 0) <= 0 THEN
      RAISE EXCEPTION 'Dokument % är inget avdrag', d.invoice_number;
    END IF;
    IF d.settle_mode <> 'avrakning' THEN RAISE EXCEPTION 'Avdrag % ska betalas till bankgiro och kvittas inte', d.invoice_number; END IF;
    IF d.status <> 'sent' OR d.paid_at IS NOT NULL THEN RAISE EXCEPTION 'Avdrag % är inte öppet (krediterat, betalt eller makulerat)', d.invoice_number; END IF;
    IF EXISTS (SELECT 1 FROM public.montor_debit_invoices c WHERE c.credited_from_invoice_id = d.id) THEN
      RAISE EXCEPTION 'Avdrag % är krediterat', d.invoice_number;
    END IF;
  END LOOP;

  FOR d IN
    SELECT * FROM public.montor_debit_invoices WHERE id = ANY(v_ded_ids)
    ORDER BY date, created_at, invoice_number
  LOOP
    SELECT COALESCE(sum(abs(it.amount)), 0) INTO v_used FROM public.montor_settlement_items it
      WHERE it.debit_invoice_id = d.id AND it.item_kind = 'deduction' AND it.active;
    v_rem := round(d.total, 2) - v_used;
    IF v_rem <= 0 THEN RAISE EXCEPTION 'Avdrag % är redan helt kvittat', d.invoice_number; END IF;
    v_take := LEAST(v_rem, v_left);
    IF v_take > 0 THEN
      v_left := v_left - v_take;
      v_ded := v_ded + v_take;
      v_take_ids := v_take_ids || d.id;
      v_take_amt := v_take_amt || v_take;
      v_take_rem := v_take_rem || (v_rem - v_take);
    END IF;
  END LOOP;

  -- Spara: specifikation + rader atomärt
  INSERT INTO public.montor_settlements (
    team_id, settlement_date, company_name, org_nr, bankgiro, address,
    invoices_total, credits_total, deductions_total, net_amount, status, created_by
  ) VALUES (
    v_team.id, v_date, COALESCE(v_team.company_name, v_team.name), v_team.org_nr, btrim(v_team.bankgiro), v_team.address,
    v_inv, v_cred, v_ded, v_inv - v_cred - v_ded, 'created', v_name
  ) RETURNING * INTO v_s;

  FOR o IN
    SELECT * FROM public.a_orders WHERE id = ANY(v_inv_ids)
    ORDER BY COALESCE((invoice_sent_at AT TIME ZONE 'Europe/Stockholm')::date, date), invoice_number
  LOOP
    v_sort := v_sort + 1;
    INSERT INTO public.montor_settlement_items (settlement_id, item_kind, a_order_id, document_number, label, document_date, amount, document_total, sort_order)
    VALUES (v_s.id, 'invoice', o.id, COALESCE(o.invoice_number, '#' || o.order_number::text),
      concat_ws(' · ', NULLIF(btrim(o.customer_address), ''), CASE o.order_kind WHEN 'komplettering' THEN 'Komplettering' WHEN 'service' THEN 'Service' ELSE NULL END),
      COALESCE((o.invoice_sent_at AT TIME ZONE 'Europe/Stockholm')::date, o.date), round(o.total_amount, 2), round(o.total_amount, 2), v_sort);
  END LOOP;

  FOR d IN SELECT * FROM public.montor_debit_invoices WHERE id = ANY(v_sb_ids) ORDER BY date, invoice_number LOOP
    v_sort := v_sort + 1;
    INSERT INTO public.montor_settlement_items (settlement_id, item_kind, debit_invoice_id, document_number, label, document_date, amount, document_total, sort_order)
    VALUES (v_s.id, 'self_billing_invoice', d.id, d.invoice_number, COALESCE(NULLIF(btrim(d.title), ''), 'Självfaktura'), d.date, round(d.total, 2), round(d.total, 2), v_sort);
  END LOOP;

  FOR o IN
    SELECT c.*, x.invoice_number AS original_number FROM public.a_orders c
    LEFT JOIN public.a_orders x ON x.id = c.credited_from_order_id
    WHERE c.id = ANY(v_cn_a) ORDER BY c.date, c.invoice_number
  LOOP
    v_sort := v_sort + 1;
    INSERT INTO public.montor_settlement_items (settlement_id, item_kind, a_order_id, document_number, label, document_date, amount, document_total, sort_order)
    VALUES (v_s.id, 'credit_note', o.id, o.invoice_number,
      concat_ws(' · ', 'Kreditering av ' || COALESCE(o.original_number, '—'), NULLIF(btrim(o.customer_address), '')),
      o.date, round(o.total_amount, 2), round(o.total_amount, 2), v_sort);
  END LOOP;

  FOR d IN
    SELECT c.*, x.invoice_number AS original_number, x.title AS original_title FROM public.montor_debit_invoices c
    LEFT JOIN public.montor_debit_invoices x ON x.id = c.credited_from_invoice_id
    WHERE c.id = ANY(v_cn_d) ORDER BY c.date, c.invoice_number
  LOOP
    v_sort := v_sort + 1;
    INSERT INTO public.montor_settlement_items (settlement_id, item_kind, debit_invoice_id, document_number, label, document_date, amount, document_total, sort_order)
    VALUES (v_s.id, 'credit_note', d.id, d.invoice_number,
      concat_ws(' · ', 'Kreditering av ' || COALESCE(d.original_number, '—'), NULLIF(btrim(d.original_title), '')),
      d.date, round(d.total, 2), round(d.total, 2), v_sort);
  END LOOP;

  FOR i IN 1 .. COALESCE(array_length(v_take_ids, 1), 0) LOOP
    SELECT * INTO d FROM public.montor_debit_invoices WHERE id = v_take_ids[i];
    v_sort := v_sort + 1;
    INSERT INTO public.montor_settlement_items (settlement_id, item_kind, debit_invoice_id, document_number, label, document_date, amount, document_total, remaining_after, sort_order)
    VALUES (v_s.id, 'deduction', d.id, d.invoice_number,
      COALESCE(NULLIF(btrim(d.description), ''), NULLIF(btrim(d.title), ''), 'Fordran'),
      d.date, -v_take_amt[i], round(d.total, 2), v_take_rem[i], v_sort);
  END LOOP;

  INSERT INTO public.activity_log (actor_name, actor_role, action, category, description, metadata)
  VALUES (v_name, public.auth_user_role(), 'montor_settlement_created', 'order',
    'Utbetalning ' || v_s.settlement_number || ' skapad för ' || COALESCE(v_team.company_name, v_team.name),
    jsonb_build_object('settlement_id', v_s.id, 'team_id', v_team.id, 'net_amount', v_s.net_amount));

  RETURN v_s;
END $$;

-- 8. Markera betald / ångra / makulera ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_montor_settlement_paid(p_id uuid, p_date date)
RETURNS public.montor_settlements
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_s public.montor_settlements%ROWTYPE;
  v_name text := COALESCE(public.auth_user_name(), 'Okänd');
  it record;
  v_n integer;
  v_total numeric;
  v_paid numeric;
BEGIN
  IF NOT public.can_manage_montor_settlements() THEN
    RAISE EXCEPTION 'Behörighet saknas för utbetalningar' USING ERRCODE = '42501';
  END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'Betaldatum saknas'; END IF;
  SELECT * INTO v_s FROM public.montor_settlements WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Utbetalningen hittades inte'; END IF;
  IF v_s.status NOT IN ('created', 'sent') THEN
    RAISE EXCEPTION 'Utbetalning % kan inte markeras betald (status %)', v_s.settlement_number, v_s.status;
  END IF;
  PERFORM set_config('app.montor_settlement_op', 'on', true);

  UPDATE public.montor_settlements SET status = 'paid', paid_at = p_date, paid_by = v_name WHERE id = p_id RETURNING * INTO v_s;

  FOR it IN SELECT * FROM public.montor_settlement_items WHERE settlement_id = p_id AND active ORDER BY sort_order LOOP
    v_n := 0;
    IF it.a_order_id IS NOT NULL THEN
      UPDATE public.a_orders SET paid_at = p_date, paid_by = v_name WHERE id = it.a_order_id AND paid_at IS NULL;
      GET DIAGNOSTICS v_n = ROW_COUNT;
    ELSIF it.item_kind = 'self_billing_invoice' THEN
      UPDATE public.montor_debit_invoices SET paid_at = p_date, status = CASE WHEN status = 'sent' THEN 'paid' ELSE status END
        WHERE id = it.debit_invoice_id AND paid_at IS NULL;
      GET DIAGNOSTICS v_n = ROW_COUNT;
    ELSIF it.item_kind = 'credit_note' THEN
      UPDATE public.montor_debit_invoices SET paid_at = p_date WHERE id = it.debit_invoice_id AND paid_at IS NULL;
      GET DIAGNOSTICS v_n = ROW_COUNT;
    ELSIF it.item_kind = 'deduction' THEN
      SELECT total INTO v_total FROM public.montor_debit_invoices WHERE id = it.debit_invoice_id FOR UPDATE;
      SELECT COALESCE(sum(abs(x.amount)), 0) INTO v_paid FROM public.montor_settlement_items x
        JOIN public.montor_settlements s ON s.id = x.settlement_id
        WHERE x.debit_invoice_id = it.debit_invoice_id AND x.item_kind = 'deduction' AND x.active AND s.status = 'paid';
      IF v_paid >= round(v_total, 2) THEN
        UPDATE public.montor_debit_invoices SET status = 'paid', paid_at = p_date
          WHERE id = it.debit_invoice_id AND paid_at IS NULL AND status = 'sent';
        GET DIAGNOSTICS v_n = ROW_COUNT;
      END IF;
    END IF;
    IF v_n > 0 THEN
      UPDATE public.montor_settlement_items SET set_paid_at = true WHERE id = it.id;
    END IF;
  END LOOP;

  INSERT INTO public.activity_log (actor_name, actor_role, action, category, description, metadata)
  VALUES (v_name, public.auth_user_role(), 'montor_settlement_paid', 'order',
    'Utbetalning ' || v_s.settlement_number || ' markerad betald ' || p_date::text,
    jsonb_build_object('settlement_id', v_s.id));
  RETURN v_s;
END $$;

CREATE OR REPLACE FUNCTION public.undo_montor_settlement_paid(p_id uuid)
RETURNS public.montor_settlements
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_s public.montor_settlements%ROWTYPE;
  v_name text := COALESCE(public.auth_user_name(), 'Okänd');
  v_nr text;
  it record;
BEGIN
  IF NOT public.can_manage_montor_settlements() THEN
    RAISE EXCEPTION 'Behörighet saknas för utbetalningar' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_s FROM public.montor_settlements WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Utbetalningen hittades inte'; END IF;
  IF v_s.status <> 'paid' THEN RAISE EXCEPTION 'Utbetalning % är inte markerad betald', v_s.settlement_number; END IF;

  -- En kreditfaktura som kvittats i en senare specifikation bygger på att originalet är betalt här.
  SELECT s2.settlement_number INTO v_nr
  FROM public.montor_settlement_items mine
  JOIN public.montor_settlement_items other ON other.active AND other.item_kind = 'credit_note' AND other.settlement_id <> p_id
  JOIN public.montor_settlements s2 ON s2.id = other.settlement_id
  LEFT JOIN public.a_orders ca ON ca.id = other.a_order_id
  LEFT JOIN public.montor_debit_invoices cd ON cd.id = other.debit_invoice_id
  WHERE mine.settlement_id = p_id AND mine.active AND mine.set_paid_at
    AND ((mine.a_order_id IS NOT NULL AND ca.credited_from_order_id = mine.a_order_id)
      OR (mine.debit_invoice_id IS NOT NULL AND cd.credited_from_invoice_id = mine.debit_invoice_id))
  LIMIT 1;
  IF v_nr IS NOT NULL THEN
    RAISE EXCEPTION 'Kan inte ångras: en kreditfaktura på en av fakturorna kvittas i %', v_nr;
  END IF;

  PERFORM set_config('app.montor_settlement_op', 'on', true);
  FOR it IN SELECT * FROM public.montor_settlement_items WHERE settlement_id = p_id AND active AND set_paid_at LOOP
    IF it.a_order_id IS NOT NULL THEN
      UPDATE public.a_orders SET paid_at = NULL, paid_by = NULL WHERE id = it.a_order_id;
    ELSE
      UPDATE public.montor_debit_invoices SET paid_at = NULL, status = CASE WHEN status = 'paid' THEN 'sent' ELSE status END
        WHERE id = it.debit_invoice_id;
    END IF;
    UPDATE public.montor_settlement_items SET set_paid_at = false WHERE id = it.id;
  END LOOP;

  UPDATE public.montor_settlements
     SET status = CASE WHEN sent_at IS NOT NULL THEN 'sent' ELSE 'created' END, paid_at = NULL, paid_by = NULL
   WHERE id = p_id RETURNING * INTO v_s;

  INSERT INTO public.activity_log (actor_name, actor_role, action, category, description, metadata)
  VALUES (v_name, public.auth_user_role(), 'montor_settlement_paid_undone', 'order',
    'Betalmarkering ångrad för utbetalning ' || v_s.settlement_number, jsonb_build_object('settlement_id', v_s.id));
  RETURN v_s;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_montor_settlement(p_id uuid)
RETURNS public.montor_settlements
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_s public.montor_settlements%ROWTYPE;
  v_name text := COALESCE(public.auth_user_name(), 'Okänd');
BEGIN
  IF NOT public.can_manage_montor_settlements() THEN
    RAISE EXCEPTION 'Behörighet saknas för utbetalningar' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_s FROM public.montor_settlements WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Utbetalningen hittades inte'; END IF;
  IF v_s.status = 'paid' THEN RAISE EXCEPTION 'Utbetalning % är betald och kan inte makuleras – ångra betalningen först', v_s.settlement_number; END IF;
  IF v_s.status = 'cancelled' THEN RAISE EXCEPTION 'Utbetalning % är redan makulerad', v_s.settlement_number; END IF;
  UPDATE public.montor_settlement_items SET active = false WHERE settlement_id = p_id;
  UPDATE public.montor_settlements SET status = 'cancelled', cancelled_at = now(), cancelled_by = v_name
   WHERE id = p_id RETURNING * INTO v_s;
  INSERT INTO public.activity_log (actor_name, actor_role, action, category, description, metadata)
  VALUES (v_name, public.auth_user_role(), 'montor_settlement_cancelled', 'order',
    'Utbetalning ' || v_s.settlement_number || ' makulerad', jsonb_build_object('settlement_id', v_s.id));
  RETURN v_s;
END $$;

-- PDF:en sparas på en fast sökväg; funktionen sätter bara pdf_path när filen finns.
CREATE OR REPLACE FUNCTION public.set_montor_settlement_pdf(p_id uuid)
RETURNS public.montor_settlements
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_s public.montor_settlements%ROWTYPE;
  v_path text := 'montor-settlements/' || p_id::text || '.pdf';
BEGIN
  IF NOT public.can_manage_montor_settlements() THEN
    RAISE EXCEPTION 'Behörighet saknas för utbetalningar' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_s FROM public.montor_settlements WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Utbetalningen hittades inte'; END IF;
  IF v_s.status = 'cancelled' THEN RAISE EXCEPTION 'Utbetalning % är makulerad', v_s.settlement_number; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'case-documents' AND name = v_path) THEN
    RAISE EXCEPTION 'PDF:en för % är inte uppladdad', v_s.settlement_number;
  END IF;
  IF v_s.pdf_path IS DISTINCT FROM v_path THEN
    UPDATE public.montor_settlements SET pdf_path = v_path WHERE id = p_id RETURNING * INTO v_s;
  END IF;
  RETURN v_s;
END $$;

REVOKE ALL ON FUNCTION public.create_montor_settlement(uuid, uuid[], uuid[], uuid[], uuid[], date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_montor_settlement_paid(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.undo_montor_settlement_paid(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_montor_settlement(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_montor_settlement_pdf(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_montor_settlements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_montor_settlement(uuid, uuid[], uuid[], uuid[], uuid[], date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_montor_settlement_paid(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.undo_montor_settlement_paid(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_montor_settlement(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_montor_settlement_pdf(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_montor_settlements() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_montor_settlement_number() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.montor_settlement_items_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.montor_settlement_source_guard() FROM PUBLIC, anon, authenticated;

-- 9. Montörens åtkomst till specifikationens PDF (bara eget team, skickad eller betald) --
CREATE POLICY "Installer reads own team settlement pdfs" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'case-documents'
    AND public.auth_user_role() = 'montor'
    AND EXISTS (
      SELECT 1 FROM public.montor_settlements s
      JOIN public.montor_teams t ON t.id = s.team_id
      WHERE s.pdf_path = storage.objects.name
        AND s.status IN ('sent', 'paid')
        AND t.name = public.auth_user_name()
    )
  );

-- 10. Drive-synk: specifikationen väcker synken när PDF:en finns och den är skickad -------
CREATE OR REPLACE FUNCTION public.drive_sync_source_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE h boolean:=false; BEGIN IF TG_TABLE_NAME='a_orders' THEN h:=NEW.status IN ('invoiced','credited') AND NEW.invoice_number IS NOT NULL AND NEW.pdf_path IS NOT NULL; ELSIF TG_TABLE_NAME='montor_debit_invoices' THEN h:=NEW.pdf_path IS NOT NULL; ELSIF TG_TABLE_NAME='case_documents' THEN h:=NEW.file_path IS NOT NULL; ELSIF TG_TABLE_NAME='case_costs' THEN h:=NEW.receipt_path IS NOT NULL OR NEW.receipt_url IS NOT NULL; ELSIF TG_TABLE_NAME='uppdrag' THEN h:=NEW.handpenning_pdf_path IS NOT NULL OR NEW.slutfaktura_pdf_path IS NOT NULL; ELSIF TG_TABLE_NAME='offers' THEN h:=NEW.signed_pdf_path IS NOT NULL OR NEW.confirmation_pdf_path IS NOT NULL; ELSIF TG_TABLE_NAME='montor_settlements' THEN h:=NEW.pdf_path IS NOT NULL AND NEW.status IN ('sent','paid'); END IF; IF h THEN UPDATE public.drive_sync_runtime SET generation=generation+1 WHERE id=1; PERFORM public.drive_sync_wake(); END IF; RETURN NEW; EXCEPTION WHEN OTHERS THEN RETURN NEW; END $function$;

CREATE TRIGGER drive_sync_montor_settlements AFTER INSERT OR UPDATE OF pdf_path, status ON public.montor_settlements
  FOR EACH ROW EXECUTE FUNCTION public.drive_sync_source_changed();