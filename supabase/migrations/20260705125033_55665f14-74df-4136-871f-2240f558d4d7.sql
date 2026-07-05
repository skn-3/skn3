CREATE TABLE public.order_climate_compensation (
  order_id UUID PRIMARY KEY REFERENCES public.a_orders(id) ON DELETE CASCADE,
  klimat_kompenserad_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  klimat_tree_count INTEGER NOT NULL CHECK (klimat_tree_count BETWEEN 1 AND 500),
  klimat_verification_id TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.order_climate_compensation TO authenticated;
GRANT ALL ON public.order_climate_compensation TO service_role;

ALTER TABLE public.order_climate_compensation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read climate" ON public.order_climate_compensation
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth insert climate" ON public.order_climate_compensation
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "admin update climate" ON public.order_climate_compensation
  FOR UPDATE TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());

CREATE POLICY "admin delete climate" ON public.order_climate_compensation
  FOR DELETE TO authenticated USING (public.auth_is_admin());

CREATE TRIGGER update_order_climate_compensation_updated_at
  BEFORE UPDATE ON public.order_climate_compensation
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();