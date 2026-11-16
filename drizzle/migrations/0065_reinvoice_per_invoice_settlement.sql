-- Omfakturering på samma A-orderrad: betalbarhet, kvittning och utbetalningsrader per faktura.

-- 1. Ögonblicksbild på kreditfakturan: vilket nummer den krediterar och om det då var betalt.
ALTER TABLE public.a_orders ADD COLUMN IF NOT EXISTS credited_invoice_number text;
ALTER TABLE public.a_orders ADD COLUMN IF NOT EXISTS credit_refund_due boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.a_orders.credited_invoice_number IS 'Kreditfaktura: originalradens invoice_number vid krediteringen (raden kan senare faktureras om med nytt nummer).';
COMMENT ON COLUMN public.a_orders.credit_refund_due IS 'Kreditfaktura: den krediterade fakturan var betald vid krediteringen och kan kvittas i en utbetalning.';

-- Befintliga kreditfakturor: bara när originalet inte fakturerats om efter krediteringen vet vi nummer och betalstatus.
UPDATE public.a_orders c
   SET credited_invoice_number = x.invoice_number,
       credit_refund_due = (x.paid_at IS NOT NULL)
  FROM public.a_orders x
 WHERE c.credited_from_order_id = x.id
   AND COALESCE(x.invoice_sent_at <= c.created_at, x.status = 'credited');

CREATE OR REPLACE FUNCTION public.a_orders_credit_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nr text; v_paid boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.credited_from_order_id IS NOT NULL THEN
      SELECT x.invoice_number, (x.paid_at IS NOT NULL) INTO v_nr, v_paid FROM public.a_orders x WHERE x.id = NEW.credited_from_order_id;
      NEW.credited_invoice_number := v_nr;
      NEW.credit_refund_due := COALESCE(v_paid, false);
    ELSE
      NEW.credited_invoice_number := NULL;
      NEW.credit_refund_due := false;
    END IF;
    RETURN NEW;
  END IF;
  -- Ögonblicksbilden ändras bara av utbetalningsfunktionerna.
  IF current_setting('app.montor_settlement_op', true) IS DISTINCT FROM 'on' THEN
    NEW.credited_invoice_number := OLD.credited_invoice_number;
    NEW.credit_refund_due := OLD.credit_refund_due;
  END IF;
  -- Omfakturering: den nya fakturans tid får aldrig hamna före kreditfakturan (klientens klocka kan gå efter).
  IF OLD.status = 'credited' AND NEW.status = 'invoiced' AND OLD.credited_from_order_id IS NULL THEN
    NEW.invoice_sent_at := GREATEST(COALESCE(NEW.invoice_sent_at, now()), now());
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.a_orders_credit_snapshot() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_a_orders_credit_snapshot ON public.a_orders;
CREATE TRIGGER trg_a_orders_credit_snapshot BEFORE INSERT OR UPDATE ON public.a_orders
  FOR EACH ROW EXECUTE FUNCTION public.a_orders_credit_snapshot();

-- 2. En aktiv rad per faktura (A-orderrad + fakturanummer), inte per A-orderrad.
CREATE UNIQUE INDEX IF NOT EXISTS montor_settlement_items_one_active_a_order_doc
  ON public.montor_settlement_items(a_order_id, document_number) WHERE active AND a_order_id IS NOT NULL;
DROP INDEX IF EXISTS public.montor_settlement_items_one_active_a_order;

-- 3. Spärrar, skapa, markera betald och ångra per faktura.
CREATE OR REPLACE FUNCTION public.montor_settlement_source_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_nr text; v_kind text;
BEGIN
  IF current_setting('app.montor_settlement_op', true) = 'on' THEN RETURN NEW; END IF;

  IF TG_TABLE_NAME = 'a_orders' THEN
    -- Per faktura: vid omfakturering (nytt nummer) får paid_at nollställas trots att den tidigare fakturan ingår i en utbetalning.
    IF TG_OP = 'UPDATE' AND NEW.paid_at IS DISTINCT FROM OLD.paid_at AND NEW.invoice_number IS NOT DISTINCT FROM OLD.invoice_number THEN
      SELECT s.settlement_number INTO v_nr FROM public.montor_settlement_items i
        JOIN public.montor_settlements s ON s.id = i.settlement_id
        WHERE i.a_order_id = NEW.id AND i.active
          AND i.document_number = COALESCE(NEW.invoice_number, '#' || NEW.order_number::text) LIMIT 1;
      IF v_nr IS NOT NULL THEN
        RAISE EXCEPTION 'Fakturan ingår i % – betalningen markeras på utbetalningen', v_nr USING ERRCODE = 'P0001';
      END IF;
    ELSIF TG_OP = 'INSERT' AND NEW.credited_from_order_id IS NOT NULL THEN
      SELECT s.settlement_number INTO v_nr FROM public.montor_settlement_items i
        JOIN public.montor_settlements s ON s.id = i.settlement_id
        WHERE i.a_order_id = NEW.credited_from_order_id AND i.active AND s.status IN ('created', 'sent')
          AND i.document_number = (SELECT COALESCE(x.invoice_number, '#' || x.order_number::text) FROM public.a_orders x WHERE x.id = NEW.credited_from_order_id)
        LIMIT 1;
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
END $function$;

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
    -- Bara den nuvarande fakturan räknas: en kreditfaktura skapad före omfaktureringen gäller en tidigare faktura.
    IF EXISTS (SELECT 1 FROM public.a_orders c WHERE c.credited_from_order_id = o.id
                AND c.created_at >= COALESCE(o.invoice_sent_at, '-infinity'::timestamptz)) THEN
      RAISE EXCEPTION 'Faktura % är krediterad', v_nr;
    END IF;
    IF EXISTS (SELECT 1 FROM public.montor_settlement_items it WHERE it.a_order_id = o.id AND it.active AND it.document_number = v_nr) THEN
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
      -- Ögonblicksbild från krediteringen: var den krediterade fakturan betald då?
      IF NOT COALESCE(o.credit_refund_due, false) THEN
        RAISE EXCEPTION 'Fakturan som % krediterar var inte betald – inget att kvitta', o.invoice_number;
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
      concat_ws(' · ', 'Kreditering av ' || COALESCE(o.credited_invoice_number, o.original_number, '—'), NULLIF(btrim(o.customer_address), '')),
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

CREATE OR REPLACE FUNCTION public.mark_montor_settlement_paid(p_id uuid, p_date date)
 RETURNS montor_settlements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      UPDATE public.a_orders SET paid_at = p_date, paid_by = v_name WHERE id = it.a_order_id AND paid_at IS NULL
        AND COALESCE(invoice_number, '#' || order_number::text) = it.document_number;
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
END $function$;

CREATE OR REPLACE FUNCTION public.undo_montor_settlement_paid(p_id uuid)
 RETURNS montor_settlements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_s public.montor_settlements%ROWTYPE;
  v_name text := COALESCE(public.auth_user_name(), 'Okänd');
  v_nr text;
  it record;
  d record;
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
    AND ((mine.a_order_id IS NOT NULL AND ca.credited_from_order_id = mine.a_order_id
          AND COALESCE(ca.credited_invoice_number, mine.document_number) = mine.document_number)
      OR (mine.debit_invoice_id IS NOT NULL AND cd.credited_from_invoice_id = mine.debit_invoice_id))
  LIMIT 1;
  IF v_nr IS NOT NULL THEN
    RAISE EXCEPTION 'Kan inte ångras: en kreditfaktura på en av fakturorna kvittas i %', v_nr;
  END IF;

  PERFORM set_config('app.montor_settlement_op', 'on', true);
  FOR it IN SELECT * FROM public.montor_settlement_items WHERE settlement_id = p_id AND active AND set_paid_at LOOP
    IF it.a_order_id IS NOT NULL THEN
      -- Bara om raden fortfarande bär samma faktura; efter omfakturering gäller paid_at den nya fakturan.
      UPDATE public.a_orders SET paid_at = NULL, paid_by = NULL WHERE id = it.a_order_id
        AND COALESCE(invoice_number, '#' || order_number::text) = it.document_number;
      -- Fakturan var alltså inte betald: en kreditering av just den fakturan har inget att kvitta.
      UPDATE public.a_orders SET credit_refund_due = false
       WHERE credited_from_order_id = it.a_order_id AND credited_invoice_number = it.document_number AND credit_refund_due;
    ELSE
      UPDATE public.montor_debit_invoices SET paid_at = NULL, status = CASE WHEN status = 'paid' THEN 'sent' ELSE status END
        WHERE id = it.debit_invoice_id;
    END IF;
    UPDATE public.montor_settlement_items SET set_paid_at = false WHERE id = it.id;
  END LOOP;

  UPDATE public.montor_settlements
     SET status = CASE WHEN sent_at IS NOT NULL THEN 'sent' ELSE 'created' END, paid_at = NULL, paid_by = NULL
   WHERE id = p_id RETURNING * INTO v_s;

  -- Delkvittade avdrag: en annan betald specifikation kan ha satt avdraget betalt när summan nådde totalen.
  -- Räcker de aktiva kvittningarna i betalda specifikationer inte längre, blir avdraget obetalt igen.
  FOR d IN
    SELECT di.id, di.total,
           COALESCE((SELECT SUM(-x.amount)
                       FROM public.montor_settlement_items x
                       JOIN public.montor_settlements xs ON xs.id = x.settlement_id
                      WHERE x.debit_invoice_id = di.id AND x.item_kind = 'deduction'
                        AND x.active AND xs.status = 'paid'), 0) AS paid_offset
      FROM public.montor_debit_invoices di
     WHERE di.status = 'paid'
       AND di.id IN (SELECT debit_invoice_id FROM public.montor_settlement_items
                      WHERE settlement_id = p_id AND item_kind = 'deduction' AND active)
  LOOP
    IF round(d.paid_offset, 2) < round(d.total, 2) THEN
      UPDATE public.montor_debit_invoices SET status = 'sent', paid_at = NULL WHERE id = d.id;
      UPDATE public.montor_settlement_items SET set_paid_at = false
       WHERE debit_invoice_id = d.id AND item_kind = 'deduction' AND set_paid_at;
    END IF;
  END LOOP;

  INSERT INTO public.activity_log (actor_name, actor_role, action, category, description, metadata)
  VALUES (v_name, public.auth_user_role(), 'montor_settlement_paid_undone', 'order',
    'Betalmarkering ångrad för utbetalning ' || v_s.settlement_number, jsonb_build_object('settlement_id', v_s.id));
  RETURN v_s;
END $function$;

REVOKE ALL ON FUNCTION public.create_montor_settlement(uuid, uuid[], uuid[], uuid[], uuid[], date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_montor_settlement(uuid, uuid[], uuid[], uuid[], uuid[], date) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_montor_settlement_paid(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_montor_settlement_paid(uuid, date) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.undo_montor_settlement_paid(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_montor_settlement_paid(uuid) TO authenticated, service_role;