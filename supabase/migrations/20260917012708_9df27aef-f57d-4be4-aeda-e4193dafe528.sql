ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS montor_notes text;

CREATE TABLE IF NOT EXISTS public.future_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  address text,
  phone text,
  seller text NOT NULL,
  description text NOT NULL,
  contact_date date NOT NULL,
  status text NOT NULL DEFAULT 'open',
  reminded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text
);

GRANT SELECT, INSERT, UPDATE ON public.future_jobs TO authenticated;
GRANT ALL ON public.future_jobs TO service_role;

ALTER TABLE public.future_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view future jobs" ON public.future_jobs FOR SELECT TO authenticated
USING (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator'));

CREATE POLICY "Staff can create future jobs" ON public.future_jobs FOR INSERT TO authenticated
WITH CHECK (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator'));

CREATE POLICY "Staff can update future jobs" ON public.future_jobs FOR UPDATE TO authenticated
USING (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator'))
WITH CHECK (public.auth_is_admin() OR public.auth_user_role() IN ('seller','coordinator'));