REVOKE ALL ON public.notifications,public.conversations,public.conversation_members,public.messages FROM anon,authenticated;
GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE(read_at) ON public.notifications TO authenticated;
GRANT SELECT ON public.conversations TO authenticated;
GRANT SELECT ON public.conversation_members TO authenticated;
GRANT UPDATE(last_read_at) ON public.conversation_members TO authenticated;
GRANT SELECT ON public.messages TO authenticated;
GRANT INSERT(conversation_id,sender_id,body) ON public.messages TO authenticated;
COMMENT ON FUNCTION public.start_conversation(uuid[],text) IS 'Only authenticated membership creation entrypoint; always includes the caller and reuses exact two-person conversations.';