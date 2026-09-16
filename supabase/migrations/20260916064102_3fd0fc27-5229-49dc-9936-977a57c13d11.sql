ALTER TABLE public.montor_debit_invoices ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'debit';

CREATE OR REPLACE FUNCTION public.next_team_invoice_number(p_team_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  RETURN v_prefix || '-' || v_no::text;
END $$;

REVOKE EXECUTE ON FUNCTION public.next_team_invoice_number(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_team_invoice_number(uuid) TO authenticated, service_role;