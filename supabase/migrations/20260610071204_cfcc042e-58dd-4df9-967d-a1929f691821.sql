
-- 1) Create user_roles
CREATE TABLE public.user_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('seller','montor','coordinator')),
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 2) Copy data BEFORE dropping columns
INSERT INTO public.user_roles (user_id, role, is_admin)
SELECT id, role, is_admin FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

-- 3) Policy
CREATE POLICY user_roles_select_own ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.auth_is_admin());

-- 4) Repoint helper functions to user_roles
CREATE OR REPLACE FUNCTION public.auth_is_admin() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT coalesce((SELECT is_admin FROM public.user_roles WHERE user_id = auth.uid()), false)
$$;

CREATE OR REPLACE FUNCTION public.auth_user_role() RETURNS text
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT (SELECT role FROM public.user_roles WHERE user_id = auth.uid())
$$;

-- 5) Drop role data + obsolete protection from profiles
DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
DROP FUNCTION IF EXISTS public.prevent_role_escalation();
ALTER TABLE public.profiles DROP COLUMN IF EXISTS role;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS is_admin;
