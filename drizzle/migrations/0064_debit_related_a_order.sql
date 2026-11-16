-- Valfri koppling från ett avdrag till den självfaktura (A-orderrad) det avser.
-- Pekar på raden, inte numret: en krediterad A-order som faktureras om behåller kopplingen.
ALTER TABLE public.montor_debit_invoices
  ADD COLUMN IF NOT EXISTS related_a_order_id uuid NULL REFERENCES public.a_orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS montor_debit_invoices_related_a_order_idx ON public.montor_debit_invoices(related_a_order_id) WHERE related_a_order_id IS NOT NULL;
COMMENT ON COLUMN public.montor_debit_invoices.related_a_order_id IS 'Avdraget avser denna A-order/komplettering/serviceorder (valfritt). Bara kind debit, samma team. Står aldrig på självfakturan.';

CREATE OR REPLACE FUNCTION public.montor_debit_related_order_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_team uuid;
BEGIN
  -- Kreditering av ett avdrag ärver kopplingen från originalet.
  IF TG_OP = 'INSERT' AND NEW.related_a_order_id IS NULL AND NEW.credited_from_invoice_id IS NOT NULL AND NEW.kind = 'debit' THEN
    SELECT related_a_order_id INTO NEW.related_a_order_id FROM public.montor_debit_invoices WHERE id = NEW.credited_from_invoice_id;
  END IF;
  IF NEW.related_a_order_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.kind IS DISTINCT FROM 'debit' THEN
    RAISE EXCEPTION 'Bara avdrag kan kopplas till en faktura';
  END IF;
  SELECT team_id INTO v_team FROM public.a_orders WHERE id = NEW.related_a_order_id;
  IF NOT FOUND OR v_team IS DISTINCT FROM NEW.team_id THEN
    RAISE EXCEPTION 'Fakturan tillhör ett annat team';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_montor_debit_related_order_guard ON public.montor_debit_invoices;
CREATE TRIGGER trg_montor_debit_related_order_guard
  BEFORE INSERT OR UPDATE OF related_a_order_id, team_id, kind ON public.montor_debit_invoices
  FOR EACH ROW EXECUTE FUNCTION public.montor_debit_related_order_guard();

REVOKE ALL ON FUNCTION public.montor_debit_related_order_guard() FROM PUBLIC, anon, authenticated;

-- Specifikationens avdragsrad visar fakturan avdraget avser (nuvarande nummer). Fördelningen är oförändrad.
CREATE OR REPLACE FUNCTION public.create_montor_settlement(p_team_id uuid, p_invoice_ids uuid[], p_self_billing_ids uuid[], p_credit_note_ids uuid[], p_deduction_ids uuid[], p_date date DEFAULT NULL::date)
 RETURNS montor_settlements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    SELECT m.*, x.invoice_number AS related_invoice_number, x.order_number AS related_order_number, x.customer_address AS related_address
      INTO d FROM public.montor_debit_invoices m
      LEFT JOIN public.a_orders x ON x.id = m.related_a_order_id
      WHERE m.id = v_take_ids[i];
    v_sort := v_sort + 1;
    INSERT INTO public.montor_settlement_items (settlement_id, item_kind, debit_invoice_id, document_number, label, document_date, amount, document_total, remaining_after, sort_order)
    VALUES (v_s.id, 'deduction', d.id, d.invoice_number,
      concat_ws(' · ',
        CASE WHEN d.related_a_order_id IS NOT NULL THEN
          'Avser ' || COALESCE(d.related_invoice_number, '#' || d.related_order_number::text, '—')
            || COALESCE(' (' || NULLIF(btrim(d.related_address), '') || ')', '')
        END,
        COALESCE(NULLIF(btrim(d.description), ''), NULLIF(btrim(d.title), ''), 'Fordran')),
      d.date, -v_take_amt[i], round(d.total, 2), v_take_rem[i], v_sort);
  END LOOP;

  INSERT INTO public.activity_log (actor_name, actor_role, action, category, description, metadata)
  VALUES (v_name, public.auth_user_role(), 'montor_settlement_created', 'order',
    'Utbetalning ' || v_s.settlement_number || ' skapad för ' || COALESCE(v_team.company_name, v_team.name),
    jsonb_build_object('settlement_id', v_s.id, 'team_id', v_team.id, 'net_amount', v_s.net_amount));

  RETURN v_s;
END $function$;