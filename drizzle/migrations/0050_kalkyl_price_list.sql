-- Offertsystem för övriga tjänster, etapp 1: prislista, prislogg, kalkylinställningar,
-- kalkyldata på offerter och bucket för produktbilder. Alla priser exklusive moms.

CREATE TABLE public.price_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  trade text NOT NULL CHECK (trade IN ('golv','malning','tak','fasad','badrum','kok','altan','renovering','gemensamt')),
  kind text NOT NULL CHECK (kind IN ('arbete','material','tillbehor','ovrigt')),
  rot_class text NOT NULL CHECK (rot_class IN ('arbete','material','ovrigt')),
  slot text,
  name text NOT NULL,
  spec text,
  unit text NOT NULL,
  price_ex_vat numeric,
  cost_ex_vat numeric,
  hours_per_unit numeric,
  level text CHECK (level IN ('bas','standard','premium')),
  pack_size numeric,
  pack_label text,
  waste_pct numeric NOT NULL DEFAULT 0,
  coverage numeric,
  color_system text CHECK (color_system IN ('NCS','RAL')),
  color_code text,
  color_hex text,
  swatch jsonb,
  image_path text,
  article_no text,
  supplier text,
  source text,
  price_date date,
  status text NOT NULL DEFAULT 'utkast' CHECK (status IN ('utkast','godkand','arkiverad')),
  approved_by text,
  approved_at timestamptz,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
COMMENT ON TABLE public.price_items IS 'Prislista för entreprenadkalkylen. Priser exklusive moms; NULL betyder att priset saknas och får aldrig ersättas med ett påhittat värde.';
CREATE INDEX price_items_trade_kind_idx ON public.price_items (trade, kind);
CREATE INDEX price_items_slot_idx ON public.price_items (slot);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_items TO authenticated;
GRANT ALL ON public.price_items TO service_role;
ALTER TABLE public.price_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage price_items" ON public.price_items FOR ALL TO authenticated
  USING (public.auth_is_admin() OR public.auth_user_role() = ANY (ARRAY['seller','coordinator']))
  WITH CHECK (public.auth_is_admin() OR public.auth_user_role() = ANY (ARRAY['seller','coordinator']));

CREATE TRIGGER price_items_touch BEFORE UPDATE ON public.price_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.price_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_item_id uuid NOT NULL REFERENCES public.price_items(id) ON DELETE CASCADE,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by text,
  field text NOT NULL,
  old_value text,
  new_value text
);
CREATE INDEX price_log_item_idx ON public.price_log (price_item_id, changed_at DESC);

GRANT SELECT ON public.price_log TO authenticated;
GRANT ALL ON public.price_log TO service_role;
ALTER TABLE public.price_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read price_log" ON public.price_log FOR SELECT TO authenticated
  USING (public.auth_is_admin() OR public.auth_user_role() = ANY (ARRAY['seller','coordinator']));

CREATE OR REPLACE FUNCTION public.price_items_log_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_by text;
BEGIN
  v_by := NULLIF(trim(coalesce(NEW.updated_by, '')), '');
  IF v_by IS NULL THEN
    SELECT p.name INTO v_by FROM public.profiles p WHERE p.id = auth.uid();
  END IF;
  IF NEW.price_ex_vat IS DISTINCT FROM OLD.price_ex_vat THEN
    INSERT INTO public.price_log (price_item_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, v_by, 'price_ex_vat', OLD.price_ex_vat::text, NEW.price_ex_vat::text);
  END IF;
  IF NEW.cost_ex_vat IS DISTINCT FROM OLD.cost_ex_vat THEN
    INSERT INTO public.price_log (price_item_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, v_by, 'cost_ex_vat', OLD.cost_ex_vat::text, NEW.cost_ex_vat::text);
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.price_log (price_item_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, v_by, 'status', OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.price_items_log_changes() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER price_items_log_changes AFTER UPDATE ON public.price_items
  FOR EACH ROW EXECUTE FUNCTION public.price_items_log_changes();

CREATE TABLE public.kalkyl_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kalkyl_settings TO authenticated;
GRANT ALL ON public.kalkyl_settings TO service_role;
ALTER TABLE public.kalkyl_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage kalkyl_settings" ON public.kalkyl_settings FOR ALL TO authenticated
  USING (public.auth_is_admin() OR public.auth_user_role() = ANY (ARRAY['seller','coordinator']))
  WITH CHECK (public.auth_is_admin() OR public.auth_user_role() = ANY (ARRAY['seller','coordinator']));
CREATE TRIGGER kalkyl_settings_touch BEFORE UPDATE ON public.kalkyl_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.kalkyl_settings (id, data) VALUES
  (1, '{"margin_target_pct":25,"price_max_age_days":60,"door_width_m":0.9,"door_height_m":2.1,"window_width_m":1.2,"window_height_m":1.3}'::jsonb)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS calc_data jsonb,
  ADD COLUMN IF NOT EXISTS calc_version integer;
COMMENT ON COLUMN public.offers.calc_data IS 'Kalkyl per rum och yta (src/lib/kalkyl). Belopp exklusive moms.';

-- Produktbilder (ingen persondata). Bucketen är privat eftersom arbetsytan spärrar publika buckets;
-- personal läser via signerade länkar. Skrivning och radering bara för personal.
DROP POLICY IF EXISTS catalog_images_staff_select ON storage.objects;
CREATE POLICY catalog_images_staff_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'catalog-images' AND (public.auth_is_admin() OR public.auth_user_role() = ANY (ARRAY['seller','coordinator'])));
DROP POLICY IF EXISTS catalog_images_staff_insert ON storage.objects;
CREATE POLICY catalog_images_staff_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'catalog-images' AND (public.auth_is_admin() OR public.auth_user_role() = ANY (ARRAY['seller','coordinator'])));
DROP POLICY IF EXISTS catalog_images_staff_update ON storage.objects;
CREATE POLICY catalog_images_staff_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'catalog-images' AND (public.auth_is_admin() OR public.auth_user_role() = ANY (ARRAY['seller','coordinator'])))
  WITH CHECK (bucket_id = 'catalog-images' AND (public.auth_is_admin() OR public.auth_user_role() = ANY (ARRAY['seller','coordinator'])));
DROP POLICY IF EXISTS catalog_images_staff_delete ON storage.objects;
CREATE POLICY catalog_images_staff_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'catalog-images' AND (public.auth_is_admin() OR public.auth_user_role() = ANY (ARRAY['seller','coordinator'])));

-- Startdata: exempelpriser från skissen, alla som utkast utan kostnad.
INSERT INTO public.price_items
  (code, trade, kind, rot_class, slot, name, spec, unit, price_ex_vat, level, pack_size, pack_label, waste_pct, coverage,
   color_system, color_code, color_hex, swatch, meta, sort_order, status, price_date, source)
SELECT v.code, v.trade, v.kind, v.rot_class, v.slot, v.name, v.spec, v.unit, v.price, v.level, v.pack_size, v.pack_label,
       v.waste, v.coverage, v.color_system, v.color_code, v.color_hex, v.swatch::jsonb, v.meta::jsonb, v.sort_order,
       'utkast', DATE '2026-11-12', 'Exempelpris från skissen 12 nov 2026, ersätts av prisark'
FROM (VALUES
  ('golv.mat.laminat-ek','golv','material','material','golv.golvtyp','Laminat ek','8 mm, klick','m²',199.20::numeric,'bas',2.22::numeric,'paket',8::numeric,NULL::numeric,NULL,NULL,NULL,'{"color":"#D9C3A0","line":"rgba(90,62,28,0.30)","pattern":"plank","step":16}','{"lay_code":"golv.arb.lagg-laminat"}',10),
  ('golv.mat.ekparkett-3stav','golv','material','material','golv.golvtyp','Ekparkett 3-stav','14 mm, mattlack','m²',343.20,'standard',3.18,'paket',8,NULL,NULL,NULL,NULL,'{"color":"#C9A877","line":"rgba(90,62,28,0.34)","pattern":"plank","step":8}','{"lay_code":"golv.arb.lagg-klick"}',20),
  ('golv.mat.ekplank-1stav','golv','material','material','golv.golvtyp','Ekplank 1-stav','14 mm, hårdvaxolja','m²',599.20,'premium',2.77,'paket',8,NULL,NULL,NULL,NULL,'{"color":"#B98F5E","line":"rgba(70,45,18,0.40)","pattern":"plank","step":20}','{"lay_code":"golv.arb.lagg-klick"}',30),
  ('golv.mat.fiskben-ek','golv','material','material','golv.golvtyp','Fiskben ek','14 mm, mattlack','m²',716.00,'premium',1.01,'paket',12,NULL,NULL,NULL,NULL,'{"color":"#C09A68","line":"rgba(70,45,18,0.30)","pattern":"fiskben","step":22}','{"lay_code":"golv.arb.lagg-fiskben"}',40),
  ('golv.arb.lagg-laminat','golv','arbete','arbete',NULL,'Läggning laminat','Flytande läggning','m²',196.00,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,'{}',50),
  ('golv.arb.lagg-klick','golv','arbete','arbete',NULL,'Läggning klickparkett','Flytande läggning','m²',236.00,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,'{}',60),
  ('golv.arb.lagg-fiskben','golv','arbete','arbete',NULL,'Läggning fiskben','Mönsterläggning','m²',556.00,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,'{}',70),
  ('golv.mat.underlag','golv','tillbehor','material','golv.underlag','Underlag med ångspärr','Foam, rulle 15 m²','m²',31.20,NULL,15,'rulle',5,NULL,NULL,NULL,NULL,NULL,'{}',80),
  ('golv.mat.sockel-vit-12x56','golv','tillbehor','material','golv.sockel','Sockellist vit 12×56','Målad, längd 2,4 m','m',24.80,NULL,2.4,'längd',10,NULL,'NCS','S 0502-Y','#F3F0E6',NULL,'{}',90),
  ('golv.arb.sockel-montering','golv','arbete','arbete',NULL,'Montering sockellist',NULL,'m',36.00,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,'{}',100),
  ('golv.mat.troskel-ek','golv','tillbehor','material','golv.troskel','Tröskel ek',NULL,'st',279.20,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,'{}',110),
  ('golv.arb.troskel-montering','golv','arbete','arbete',NULL,'Montering tröskel',NULL,'st',120.00,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,'{}',120),
  ('golv.arb.rivning','golv','arbete','arbete',NULL,'Rivning befintligt golv',NULL,'m²',76.00,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,'{}',130),
  ('golv.mat.flytspackel','golv','material','material',NULL,'Flytspackel','Upp till 10 mm','m²',78.40,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,'{}',140),
  ('golv.arb.flytspackling','golv','arbete','arbete',NULL,'Flytspackling',NULL,'m²',117.60,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,'{}',150),
  ('gem.ovr.mobelflytt','gemensamt','ovrigt','ovrigt',NULL,'Möbelflytt',NULL,'fast',1200.00,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,'{}',160),
  ('gem.ovr.bortforsling','gemensamt','ovrigt','ovrigt',NULL,'Bortforsling, container',NULL,'fast',1520.00,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,'{}',170),
  ('gem.ovr.etablering','gemensamt','ovrigt','ovrigt',NULL,'Etablering och resor',NULL,'fast',1992.00,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,'{}',180),
  ('malning.arb.vagg-latt','malning','arbete','arbete','malning.underarbete','Målning väggar, lätt underarbete','Fläckspackling, lätt slipning, 2 strykningar','m²',132.00,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,'{}',190),
  ('malning.arb.vagg-normal','malning','arbete','arbete','malning.underarbete','Målning väggar, normalt underarbete','Spackling av skador, slipning, grundning där det behövs, 2 strykningar','m²',148.00,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,'{}',200),
  ('malning.arb.vagg-omfattande','malning','arbete','arbete','malning.underarbete','Målning väggar, omfattande underarbete','Bredspackling av hela väggytan, 2 strykningar','m²',188.00,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,'{}',210),
  ('malning.arb.vagg-extra-strykning','malning','arbete','arbete',NULL,'Extra strykning väggar',NULL,'m²',40.00,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,'{}',220),
  ('malning.mat.vaggfarg','malning','material','material','malning.vaggfarg','Väggfärg','Matt 7','l',120.00,NULL,NULL,NULL,0,8,NULL,NULL,NULL,NULL,'{}',230),
  ('malning.arb.tak','malning','arbete','arbete',NULL,'Målning tak','2 strykningar','m²',116.00,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,'{}',240),
  ('malning.mat.takfarg','malning','material','material','malning.takfarg','Takfärg','Helmatt 3','l',88.00,NULL,NULL,NULL,0,7,NULL,NULL,NULL,NULL,'{}',250),
  ('malning.mat.forbrukning','malning','material','material',NULL,'Spackel, slippapper och täckmaterial',NULL,'fast',712.00,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,'{}',260),
  ('malning.arb.foder','malning','arbete','arbete',NULL,'Målning foder','Per dörr eller fönster','st',320.00,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,'{}',270),
  ('malning.arb.sockelmalning','malning','arbete','arbete',NULL,'Målning sockel',NULL,'m',34.80,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,'{}',280),
  ('malning.mat.snickerifarg','malning','material','material','malning.snickerifarg','Snickerifärg','Halvblank 40','l',312.00,NULL,NULL,NULL,0,10,NULL,NULL,NULL,NULL,'{}',290)
) AS v(code, trade, kind, rot_class, slot, name, spec, unit, price, level, pack_size, pack_label, waste, coverage,
       color_system, color_code, color_hex, swatch, meta, sort_order)
ON CONFLICT (code) DO NOTHING;