CREATE OR REPLACE FUNCTION public.fix_a_order_sequence() RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT setval('public.a_order_number_seq',
    GREATEST(COALESCE((SELECT MAX(order_number) FROM public.a_orders), 0), 1))
$$;
REVOKE EXECUTE ON FUNCTION public.fix_a_order_sequence() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fix_a_order_sequence() TO authenticated;