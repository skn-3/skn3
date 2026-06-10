
CREATE SEQUENCE IF NOT EXISTS public.uppdrag_number_seq;

CREATE TABLE public.uppdrag (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  uppdrag_number text UNIQUE,
  offer_id uuid REFERENCES public.offers(id) ON DELETE SET NULL,
  customer_name text,
  customer_email text,
  customer_phone text,
  customer_address text,
  customer_type text,
  customer_personnummer text,
  fastighetsbeteckning text,
  title text,
  status text NOT NULL DEFAULT 'ej_paborjad',
  assigned_to text,
  revenue_ex_vat numeric,
  revenue_incl_vat numeric,
  revenue_after_rot numeric,
  rot_amount numeric,
  handpenning_amount numeric,
  slutfaktura_amount numeric,
  cost_ex_vat numeric,
  start_date date,
  done_date date,
  notes text,
  handpenning_invoice_no text,
  handpenning_pdf_path text,
  handpenning_sent_at timestamptz,
  slutfaktura_invoice_no text,
  slutfaktura_pdf_path text,
  slutfaktura_sent_at timestamptz
);

CREATE INDEX idx_uppdrag_offer_id ON public.uppdrag(offer_id);
CREATE INDEX idx_uppdrag_status ON public.uppdrag(status);
CREATE INDEX idx_uppdrag_created_at ON public.uppdrag(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.uppdrag TO authenticated;
GRANT ALL ON public.uppdrag TO service_role;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.uppdrag_number_seq TO authenticated, service_role;

ALTER TABLE public.uppdrag ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers, coordinators and admins can manage uppdrag"
  ON public.uppdrag
  FOR ALL
  TO authenticated
  USING (auth_is_admin() OR (auth_user_role() = ANY (ARRAY['seller'::text, 'coordinator'::text])))
  WITH CHECK (auth_is_admin() OR (auth_user_role() = ANY (ARRAY['seller'::text, 'coordinator'::text])));

CREATE OR REPLACE FUNCTION public.set_uppdrag_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.uppdrag_number IS NULL THEN
    NEW.uppdrag_number := to_char(now(), 'YYYY') || '-' || lpad(nextval('public.uppdrag_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_uppdrag_set_number
  BEFORE INSERT ON public.uppdrag
  FOR EACH ROW EXECUTE FUNCTION public.set_uppdrag_number();

CREATE TRIGGER trg_uppdrag_updated_at
  BEFORE UPDATE ON public.uppdrag
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
