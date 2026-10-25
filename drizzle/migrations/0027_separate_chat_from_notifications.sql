DROP TRIGGER IF EXISTS notifications_message ON public.messages;
DROP FUNCTION IF EXISTS public.notify_message_added();
COMMENT ON TABLE public.notifications IS 'Event notifications only. Chat messages use their own realtime channel and conversation read markers.';
ALTER TABLE public.notifications ADD CONSTRAINT notifications_events_only CHECK (kind <> 'message' AND (link IS NULL OR coalesce(link->>'type','') <> 'chat')) NOT VALID;