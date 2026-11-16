REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.montor_settlements FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.montor_settlement_items FROM anon, authenticated;
REVOKE SELECT ON public.montor_settlements FROM anon;
REVOKE SELECT ON public.montor_settlement_items FROM anon;
GRANT SELECT ON public.montor_settlements TO authenticated;
GRANT SELECT ON public.montor_settlement_items TO authenticated;
REVOKE USAGE, SELECT, UPDATE ON SEQUENCE public.montor_settlement_seq FROM anon, authenticated;