
-- montor_teams
CREATE TABLE public.montor_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company_name text,
  org_nr text,
  address text,
  email text,
  bankgiro text,
  invoice_prefix text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.montor_teams TO authenticated;
GRANT ALL ON public.montor_teams TO service_role;
ALTER TABLE public.montor_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage montor_teams" ON public.montor_teams FOR ALL TO authenticated
  USING (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator'))
  WITH CHECK (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator'));

INSERT INTO public.montor_teams (name, company_name, org_nr, address, email, bankgiro, invoice_prefix) VALUES
  ('GVMO', 'GVMO Bygg AB', '559297-6921', 'Slagsta Backe 29, 145 74 Norsborg', 'gvmo.bygg@gmail.com', '5648-0775', 'GVMO'),
  ('Samy', 'SMTM BYGG AB', '559541-2494', 'Sätragårdsvägen 99, 127 30 Skärholmen', 'info@smtmbygg.se', '5082-6924', 'SAMY'),
  ('Alex NBD', 'NBD AB', '559519-0918', 'Älbylund 11, 148 91 Ösmo', 'alex@nbdentreprenad.com', '833-7859', 'ALEX'),
  ('Jerk', 'STAJ Bygg och Inredning AB', '556888-7540', 'Norses Gränd 5, 170 67 Solna', 'jerk.ryttman@mockfjards.se', '852-9570', 'JERK');

-- a_order_products
CREATE TABLE public.a_order_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price numeric NOT NULL,
  category text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.a_order_products TO authenticated;
GRANT ALL ON public.a_order_products TO service_role;
ALTER TABLE public.a_order_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage a_order_products" ON public.a_order_products FOR ALL TO authenticated
  USING (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator'))
  WITH CHECK (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator'));

INSERT INTO public.a_order_products (category, name, price, sort_order) VALUES
  ('Etablering','Etablering Bilersättning',6.63,10),
  ('Etablering','Etablering restid',11.73,20),
  ('Etablering','Etablering Grundpris',703,30),
  ('Rivning','Rivning dörr/fönster',154.8,10),
  ('Rivning','Rivning putsfasad',186.7,20),
  ('Rivning','Rivning för montering i befintlig karm',140.8,30),
  ('Montering Fönster','Montering Fönster',352,10),
  ('Montering Fönster','Montering Fönster Sten/Betong',624,20),
  ('Montering Fönster','Montering Fönster 2,6-4 m2',624,30),
  ('Montering Fönster','Montering Fönster 2,6-4 m2 Sten/Betong',610,40),
  ('Montering Fönster','Montering Fönster mot bef. utsida inkl mjukfog',586.5,50),
  ('Montering Fönster','Montering Fönster 2,6-4 m2 mot bef utsida inkl mjukfog',1116.7,60),
  ('Montering Fönster','Montering i Befintlig karm',375.4,70),
  ('Montering Fönster','Montering Fönsterdörr',624,80),
  ('Montering Fönster','Montering Fönsterdörr Sten/Betong',938,90),
  ('Montering Dörr','Montering dörr trä',624,10),
  ('Montering Dörr','Montering dörr sten',938,20),
  ('Montering Dörr','Montering dörr mot bef. utsida inkl mjukfog',1126,30),
  ('Bleck & Material','Montering Bleck Trähus',79.8,10),
  ('Bleck & Material','Montering Bleck Puts/Stenhus',131.8,20),
  ('Bleck & Material','Materialkostnad underbleck tom 30cm',450.3,30),
  ('Bleck & Material','Byggavfall per enhet återvinning',40.8,40),
  ('Bleck & Material','Ersättning Infästnings material',40.8,50),
  ('Tillbehör','Arbetskostnad Inv Listning/Gerning',267.5,10),
  ('Tillbehör','Arbetskostnad Inv Smyg',178.3,20),
  ('Tillbehör','Arbetskostnad Utv Snickarglädje',272,30),
  ('Tillbehör','Arbetskostnad Utv Smyg',197,40),
  ('Tillbehör','Montering utv Plåtinklädnad L-Profil',234.6,50),
  ('Tillbehör','Materialkostnad L-Profil',638.5,60),
  ('Tillbehör','Mat. Kostnad UB',450.3,70),
  ('Tillägg','Extra Montagetimme',469,10),
  ('Tillägg','Montering dörrbroms',94,20),
  ('Tillägg','Montering Myggbåge',155,30),
  ('Tillägg','Montering låscylinder',117.3,40),
  ('Tillägg','Montering Kodlås YD',314.3,50),
  ('Tillägg','Montering Plisségardin/persienn',117.3,60),
  ('Tillägg','Montering Markis -1,5m',389.4,70),
  ('Tillägg','Montering Markis 1,5-3m',704,80),
  ('Tillägg','Montering Markis 3-6m',938.4,90),
  ('Tillägg','Montering Takfönster inkl plåt & inv. smyg',6803.4,100),
  ('Tillägg','Montering Smartflow/spaltventil',79,110),
  ('Tillägg','Montering Lösspröjs',155,120),
  ('Tillägg','Pengar till fallskydd',100,130),
  ('Tillägg','Till Montör extra kostnad',658,140);

-- a_orders
CREATE SEQUENCE public.a_order_number_seq START WITH 1000;

CREATE TABLE public.a_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number integer UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  date date NOT NULL DEFAULT current_date,
  customer_name text,
  customer_address text NOT NULL,
  customer_phone text,
  facade_type text NOT NULL DEFAULT 'tra' CHECK (facade_type IN ('tra','sten','puts')),
  window_count int NOT NULL DEFAULT 0,
  door_count int NOT NULL DEFAULT 0,
  roof_window_count int NOT NULL DEFAULT 0,
  km_distance int NOT NULL DEFAULT 0,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  description text DEFAULT '',
  total_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'order' CHECK (status IN ('order','invoiced','credited')),
  invoice_number text,
  invoice_sent_at timestamptz,
  credited_from_order_id uuid,
  scheduled_delivery boolean DEFAULT false,
  delivery_time time,
  team_id uuid NULL REFERENCES public.montor_teams(id),
  case_id uuid NULL REFERENCES public.cases(id),
  internal_extra_hours numeric DEFAULT 0,
  internal_hour_rate numeric DEFAULT 0,
  internal_extra_amount numeric DEFAULT 0,
  pdf_path text,
  source_n3prenad_id uuid UNIQUE
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.a_orders TO authenticated;
GRANT ALL ON public.a_orders TO service_role;
GRANT USAGE ON SEQUENCE public.a_order_number_seq TO authenticated;
GRANT ALL ON SEQUENCE public.a_order_number_seq TO service_role;
ALTER TABLE public.a_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage a_orders" ON public.a_orders FOR ALL TO authenticated
  USING (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator'))
  WITH CHECK (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator'));

CREATE INDEX a_orders_team_id_idx ON public.a_orders(team_id);
CREATE INDEX a_orders_case_id_idx ON public.a_orders(case_id);
CREATE INDEX a_orders_status_idx ON public.a_orders(status);

CREATE OR REPLACE FUNCTION public.set_a_order_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := nextval('public.a_order_number_seq');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_a_order_number BEFORE INSERT ON public.a_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_a_order_number();
