-- price_log skrivs bara av triggern price_items_log_changes (security definer).
REVOKE ALL ON public.price_log FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.price_log FROM authenticated;
GRANT SELECT ON public.price_log TO authenticated;