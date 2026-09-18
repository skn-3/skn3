CREATE OR REPLACE FUNCTION public.next_team_invoice_number(p_team_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix text;
  v_no integer;
BEGIN
  UPDATE public.montor_teams
     SET next_invoice_number = GREATEST(1, COALESCE(next_invoice_number, 1)) + 1
   WHERE id = p_team_id
   RETURNING COALESCE(NULLIF(invoice_prefix, ''), name), GREATEST(1, COALESCE(next_invoice_number, 1)) - 1
   INTO v_prefix, v_no;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'Montörsteam hittades inte';
  END IF;

  RETURN v_prefix || '-' || lpad(v_no::text, 3, '0');
END $function$;