REVOKE INSERT, UPDATE, DELETE ON public.ai_actions FROM authenticated, anon;
GRANT SELECT ON public.ai_actions TO authenticated;
GRANT ALL ON public.ai_actions TO service_role;