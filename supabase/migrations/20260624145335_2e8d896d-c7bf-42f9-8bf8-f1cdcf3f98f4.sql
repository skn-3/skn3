CREATE TABLE public.litteror (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  littera text,
  article_name text,
  article_code text,
  antal int DEFAULT 1,
  u_varde numeric,
  vikt numeric,
  width numeric,
  width_mod text,
  height numeric,
  height_mod text,
  brostning numeric,
  brostning_mod text,
  set_number int,
  set_position int,
  set_lead boolean DEFAULT false,
  color_inside text,
  color_outside text,
  spec jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_snapshot jsonb,
  cm_status text NOT NULL DEFAULT 'ej_paborjad'
    CHECK (cm_status IN ('ej_paborjad','justerad','inskickad','hanterad'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.litteror TO authenticated;
GRANT ALL ON public.litteror TO service_role;

ALTER TABLE public.litteror ENABLE ROW LEVEL SECURITY;

CREATE POLICY litteror_staff_all ON public.litteror FOR ALL TO authenticated
  USING (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator'))
  WITH CHECK (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator'));

CREATE POLICY litteror_montor_select ON public.litteror FOR SELECT TO authenticated
  USING (public.auth_is_my_team_case(case_id));

CREATE POLICY litteror_montor_update ON public.litteror FOR UPDATE TO authenticated
  USING (public.auth_is_my_team_case(case_id))
  WITH CHECK (public.auth_is_my_team_case(case_id));

CREATE INDEX litteror_case_id_idx ON public.litteror (case_id);