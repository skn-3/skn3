CREATE OR REPLACE FUNCTION public.login_directory()
RETURNS TABLE(name text, role text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT p.name, r.role::text
  FROM public.profiles p
  JOIN public.user_roles r ON r.user_id = p.id
  ORDER BY p.name;
$$;
REVOKE ALL ON FUNCTION public.login_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.login_directory() TO anon, authenticated;