CREATE OR REPLACE FUNCTION public.case_merge_table_label(p_table text, p_count integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT p_count::text || ' ' || CASE p_table
    WHEN 'a_orders' THEN CASE WHEN p_count = 1 THEN 'A-order' ELSE 'A-ordrar' END
    WHEN 'case_documents' THEN 'dokument'
    WHEN 'case_events' THEN CASE WHEN p_count = 1 THEN 'händelse' ELSE 'händelser' END
    WHEN 'visits' THEN 'besök'
    WHEN 'litteror' THEN CASE WHEN p_count = 1 THEN 'littera' ELSE 'litteror' END
    WHEN 'case_costs' THEN CASE WHEN p_count = 1 THEN 'kostnad' ELSE 'kostnader' END
    WHEN 'deviations' THEN CASE WHEN p_count = 1 THEN 'avvikelse' ELSE 'avvikelser' END
    WHEN 'offers' THEN CASE WHEN p_count = 1 THEN 'offert' ELSE 'offerter' END
    WHEN 'future_jobs' THEN 'framtida jobb'
    WHEN 'messages' THEN CASE WHEN p_count = 1 THEN 'chattmeddelande' ELSE 'chattmeddelanden' END
    WHEN 'case_climate_compensation' THEN CASE WHEN p_count = 1 THEN 'klimatkompensation' ELSE 'klimatkompensationer' END
    WHEN 'climate_events' THEN CASE WHEN p_count = 1 THEN 'klimathändelse' ELSE 'klimathändelser' END
    WHEN 'sheet_metal_orders' THEN CASE WHEN p_count = 1 THEN 'plåtbeställning' ELSE 'plåtbeställningar' END
    WHEN 'montor_debit_invoices' THEN CASE WHEN p_count = 1 THEN 'montörfaktura' ELSE 'montörfakturor' END
    WHEN 'notifications' THEN CASE WHEN p_count = 1 THEN 'notis' ELSE 'notiser' END
    ELSE p_table
  END
$$;

CREATE OR REPLACE FUNCTION public.merge_cases(p_keep_id uuid, p_drop_id uuid, p_choices jsonb DEFAULT '{}'::jsonb, p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_keep jsonb;
  v_drop jsonb;
  v_result jsonb;
  v_moved jsonb := '{}'::jsonb;
  v_parts text[] := '{}';
  v_fields jsonb := '[]'::jsonb;
  v_changed text[] := '{}';
  v_notifications integer := 0;
  v_count integer;
  v_key text;
  r record;
  f text;
  v_label text;
  v_kv text;
  v_dv text;
  v_res text;
  v_choice text;
  v_actor text := coalesce(public.auth_user_name(), 'System');
BEGIN
  IF NOT (public.auth_is_admin() OR public.auth_user_role() = 'coordinator') THEN
    RAISE EXCEPTION 'Endast admin och koordinator får slå ihop ärenden.';
  END IF;
  IF p_keep_id IS NULL OR p_drop_id IS NULL OR p_keep_id = p_drop_id THEN
    RAISE EXCEPTION 'Välj två olika ärenden.';
  END IF;

  BEGIN
    SELECT to_jsonb(c) INTO v_keep FROM public.cases c WHERE c.id = p_keep_id FOR UPDATE;
    SELECT to_jsonb(c) INTO v_drop FROM public.cases c WHERE c.id = p_drop_id FOR UPDATE;
    IF v_keep IS NULL OR v_drop IS NULL THEN
      RAISE EXCEPTION 'Ett av ärendena finns inte längre.';
    END IF;

    -- Flytta alla rader som pekar på dubbletten, för varje främmande nyckel mot cases.
    FOR r IN
      SELECT n.nspname, cl.relname, a.attname
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f' AND c.confrelid = 'public.cases'::regclass
        AND array_length(c.conkey, 1) = 1 AND c.conrelid <> 'public.cases'::regclass
      ORDER BY cl.relname, a.attname
    LOOP
      BEGIN
        EXECUTE format('UPDATE %I.%I SET %I = $1 WHERE %I = $2', r.nspname, r.relname, r.attname, r.attname)
          USING p_keep_id, p_drop_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
      EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'Ärendena kan inte slås ihop: båda har %, som bara får finnas en gång per ärende.', regexp_replace(public.case_merge_table_label(r.relname, 1), '^1 ', '');
      END;
      IF v_count > 0 THEN
        v_key := CASE WHEN r.attname = 'case_id' THEN r.relname ELSE r.relname || '.' || r.attname END;
        v_moved := v_moved || jsonb_build_object(v_key, coalesce((v_moved ->> v_key)::int, 0) + v_count);
        v_parts := v_parts || public.case_merge_table_label(r.relname, v_count);
      END IF;
    END LOOP;

    -- Notislänkar som pekar på dubbletten.
    UPDATE public.notifications
       SET link = jsonb_set(link, '{id}', to_jsonb(p_keep_id::text))
     WHERE link ->> 'type' = 'case' AND link ->> 'id' = p_drop_id::text;
    GET DIAGNOSTICS v_notifications = ROW_COUNT;

    -- Fält för fält: tomma fält fylls alltid; annars enligt valet keep/drop.
    FOREACH f IN ARRAY ARRAY['customer_name','address','city','customer_phone','customer_email','order_number','offer_number','status'] LOOP
      v_kv := nullif(btrim(coalesce(v_keep ->> f, '')), '');
      v_dv := nullif(btrim(coalesce(v_drop ->> f, '')), '');
      v_choice := CASE WHEN p_choices ->> f = 'drop' THEN 'drop' ELSE 'keep' END;
      IF v_kv IS NULL OR v_choice = 'drop' THEN
        v_res := coalesce(v_dv, v_kv);
      ELSE
        v_res := v_kv;
      END IF;
      v_fields := v_fields || jsonb_build_object('field', f, 'keep', v_keep ->> f, 'drop', v_drop ->> f, 'result', v_res,
        'changed', v_res IS DISTINCT FROM v_kv);
      IF v_res IS DISTINCT FROM v_kv THEN
        EXECUTE format('UPDATE public.cases SET %I = $1 WHERE id = $2', f) USING v_res, p_keep_id;
        v_label := CASE f WHEN 'customer_name' THEN 'Kundnamn' WHEN 'address' THEN 'Adress' WHEN 'city' THEN 'Ort'
          WHEN 'customer_phone' THEN 'Telefon' WHEN 'customer_email' THEN 'E-post' WHEN 'order_number' THEN 'Ordernummer'
          WHEN 'offer_number' THEN 'Affärsförslag' ELSE 'Status' END;
        v_changed := v_changed || (v_label || ': ' || coalesce(v_kv, '—') || ' → ' || v_res);
      END IF;
    END LOOP;

    IF (v_keep ->> 'visit_id') IS NULL AND (v_drop ->> 'visit_id') IS NOT NULL THEN
      UPDATE public.cases SET visit_id = (v_drop ->> 'visit_id')::uuid WHERE id = p_keep_id;
    END IF;

    INSERT INTO public.case_events (case_id, event_type, description, created_by)
    VALUES (p_keep_id, 'note',
      'Sammanslaget med dubblett: ' || coalesce(v_drop ->> 'address', '') || ' (' || coalesce(nullif(btrim(v_drop ->> 'customer_name'), ''), 'okänd kund')
        || ', säljare ' || coalesce(v_drop ->> 'seller', '—') || ', skapad ' || to_char((v_drop ->> 'created_at')::timestamptz AT TIME ZONE 'Europe/Stockholm', 'YYYY-MM-DD') || '). '
        || 'Flyttat: ' || CASE WHEN array_length(v_parts, 1) > 0 THEN array_to_string(v_parts, ', ') ELSE 'inget' END
        || CASE WHEN v_notifications > 0 THEN ', ' || public.case_merge_table_label('notifications', v_notifications) ELSE '' END || '. '
        || 'Fält ändrade: ' || CASE WHEN array_length(v_changed, 1) > 0 THEN array_to_string(v_changed, '; ') ELSE 'inga' END || '.',
      v_actor);

    DELETE FROM public.cases WHERE id = p_drop_id;

    v_result := jsonb_build_object('keep_id', p_keep_id, 'drop_id', p_drop_id, 'dry_run', p_dry_run,
      'moved', v_moved, 'notifications', v_notifications, 'fields', v_fields, 'summary', array_to_string(v_parts, ', '));

    IF p_dry_run THEN
      RAISE EXCEPTION USING ERRCODE = 'MC001', MESSAGE = 'merge_cases dry run';
    END IF;
  EXCEPTION WHEN SQLSTATE 'MC001' THEN
    RETURN v_result;
  END;

  RETURN v_result;
END
$$;

REVOKE ALL ON FUNCTION public.merge_cases(uuid, uuid, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_cases(uuid, uuid, jsonb, boolean) TO authenticated, service_role;