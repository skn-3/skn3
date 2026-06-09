
CREATE SEQUENCE IF NOT EXISTS public.offer_number_seq;

CREATE TABLE public.offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  offer_number text UNIQUE,
  status text NOT NULL DEFAULT 'draft',
  customer_type text NOT NULL DEFAULT 'privat',
  customer_name text,
  customer_email text,
  customer_phone text,
  customer_address text,
  customer_personnummer text,
  fastighetsbeteckning text,
  title text,
  description text,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  vat_mode text NOT NULL DEFAULT 'vanlig',
  vat_rate numeric NOT NULL DEFAULT 25,
  rot_enabled boolean NOT NULL DEFAULT false,
  rot_percent numeric NOT NULL DEFAULT 30,
  valid_until date,
  payment_terms text DEFAULT '10 dagar netto',
  terms_text text,
  internal_notes text,
  total_ex_vat numeric,
  total_vat numeric,
  total_incl_vat numeric,
  rot_base numeric,
  rot_amount numeric,
  total_after_rot numeric,
  pdf_path text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  public_token text,
  accept_name text,
  accept_ip text,
  accept_user_agent text,
  signed_pdf_path text
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.offers TO authenticated;
GRANT ALL ON public.offers TO service_role;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.offer_number_seq TO authenticated, service_role;

ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers, coordinators and admins can manage offers"
  ON public.offers
  FOR ALL
  TO authenticated
  USING (
    public.auth_is_admin()
    OR public.auth_user_role() IN ('seller', 'coordinator')
  )
  WITH CHECK (
    public.auth_is_admin()
    OR public.auth_user_role() IN ('seller', 'coordinator')
  );

CREATE INDEX idx_offers_case_id ON public.offers(case_id);
CREATE INDEX idx_offers_status ON public.offers(status);
CREATE INDEX idx_offers_created_at ON public.offers(created_at DESC);

CREATE OR REPLACE FUNCTION public.set_offer_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.offer_number IS NULL THEN
    NEW.offer_number := to_char(now(), 'YYYY') || '-' || lpad(nextval('public.offer_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_offers_set_number
  BEFORE INSERT ON public.offers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_offer_number();

CREATE TRIGGER trg_offers_updated_at
  BEFORE UPDATE ON public.offers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
