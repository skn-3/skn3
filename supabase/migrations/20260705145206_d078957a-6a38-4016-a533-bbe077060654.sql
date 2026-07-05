CREATE TABLE public.case_climate_compensation (
  case_id uuid PRIMARY KEY REFERENCES public.cases(id) ON DELETE CASCADE,
  kompenserad_at timestamptz NOT NULL DEFAULT now(),
  tree_count integer NOT NULL,
  verification_id text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.case_climate_compensation TO authenticated;
GRANT ALL ON public.case_climate_compensation TO service_role;

ALTER TABLE public.case_climate_compensation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read case climate" ON public.case_climate_compensation
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth insert case climate" ON public.case_climate_compensation
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "admin update case climate" ON public.case_climate_compensation
  FOR UPDATE TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());

CREATE POLICY "admin delete case climate" ON public.case_climate_compensation
  FOR DELETE TO authenticated USING (public.auth_is_admin());

CREATE TRIGGER update_case_climate_compensation_updated_at
  BEFORE UPDATE ON public.case_climate_compensation
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();