CREATE OR REPLACE FUNCTION public.append_deviation_log(p_deviation_id uuid, p_entry jsonb)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE public.deviations
  SET action_log = coalesce(action_log, '[]'::jsonb) || p_entry
  WHERE id = p_deviation_id;
$$;

REVOKE EXECUTE ON FUNCTION public.append_deviation_log(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.append_deviation_log(uuid, jsonb) TO authenticated;