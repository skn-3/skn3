CREATE OR REPLACE FUNCTION public.chat_mark_read(p_conversation_id uuid)
RETURNS timestamptz
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE public.conversation_members
     SET last_read_at = now()
   WHERE conversation_id = p_conversation_id
     AND user_id = auth.uid()
  RETURNING last_read_at;
$$;

COMMENT ON FUNCTION public.chat_mark_read(uuid) IS 'Sätter anroparens läsmarkering till serverns tid och returnerar den. Rör bara raden där user_id = auth.uid().';

REVOKE ALL ON FUNCTION public.chat_mark_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_mark_read(uuid) TO authenticated, service_role;