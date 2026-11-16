CREATE OR REPLACE FUNCTION public.undo_montor_settlement_paid(p_id uuid)
RETURNS public.montor_settlements
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END $$;

REVOKE ALL ON FUNCTION public.undo_montor_settlement_paid(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_montor_settlement_paid(uuid) TO authenticated, service_role;