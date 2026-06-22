CREATE SEQUENCE IF NOT EXISTS public.montor_debit_seq START WITH 1;

CREATE TABLE public.montor_debit_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  invoice_number text UNIQUE,
  date date NOT NULL DEFAULT current_date,
  due_date date,
  team_id uuid NOT NULL REFERENCES public.montor_teams(id),
  case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  title text,
  description text,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  vat_mode text NOT NULL DEFAULT 'omvand' CHECK (vat_mode IN ('omvand','vanlig')),
  subtotal numeric NOT NULL DEFAULT 0,
  vat_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','paid','cancelled')),
  pdf_path text,
  sent_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.montor_debit_invoices TO authenticated;
GRANT ALL ON public.montor_debit_invoices TO service_role;

ALTER TABLE public.montor_debit_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY mdi_staff_all ON public.montor_debit_invoices
  FOR ALL TO authenticated
  USING (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator'))
  WITH CHECK (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator'));

CREATE OR REPLACE FUNCTION public.set_montor_debit_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.invoice_number IS NULL THEN
    NEW.invoice_number := 'SK-' || lpad(nextval('public.montor_debit_seq')::text, 3, '0');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_set_montor_debit_number
  BEFORE INSERT ON public.montor_debit_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_montor_debit_number();