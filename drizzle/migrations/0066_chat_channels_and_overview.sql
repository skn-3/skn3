-- Chatt etapp 1: kanaler (Alla, Kontoret, teamkanaler) och översikt i en fråga.

ALTER TABLE public.conversations
  ADD COLUMN kind text NOT NULL DEFAULT 'direct',
  ADD COLUMN channel_key text,
  ADD COLUMN team_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN archived_at timestamptz;

UPDATE public.conversations SET kind = CASE WHEN is_group THEN 'group' ELSE 'direct' END;

ALTER TABLE public.conversations ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_kind_check CHECK (kind IN ('direct','group','channel')),
  ADD CONSTRAINT conversations_channel_key_key UNIQUE (channel_key),
  ADD CONSTRAINT conversations_channel_key_kind_check CHECK ((kind = 'channel') = (channel_key IS NOT NULL)),
  ADD CONSTRAINT conversations_channel_key_format_check CHECK (channel_key IS NULL OR channel_key IN ('alla','kontoret') OR channel_key ~ '^team:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  ADD CONSTRAINT conversations_is_group_kind_check CHECK (is_group = (kind <> 'direct')),
  ADD CONSTRAINT conversations_team_user_check CHECK (team_user_id IS NULL OR channel_key LIKE 'team:%'),
  ADD CONSTRAINT conversations_created_by_check CHECK (kind = 'channel' OR created_by IS NOT NULL);

COMMENT ON COLUMN public.conversations.created_by IS 'NULL only for system-created channels (kind = channel).';
COMMENT ON COLUMN public.conversations.archived_at IS 'Channels are never deleted; a team channel whose team no longer has the montor role is archived.';

CREATE INDEX IF NOT EXISTS messages_conversation_keyset ON public.messages (conversation_id, created_at DESC, id DESC);

-- Systemets kanalsynk. Enda vägen till kanalmedlemskap.
CREATE OR REPLACE FUNCTION public.chat_sync_channels()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('public.chat_sync_channels', 0));

  INSERT INTO public.conversations (kind, channel_key, title, is_group, created_by)
  VALUES ('channel', 'alla', 'Alla', true, NULL), ('channel', 'kontoret', 'Kontoret', true, NULL)
  ON CONFLICT (channel_key) DO UPDATE
    SET title = EXCLUDED.title, archived_at = NULL
    WHERE conversations.title IS DISTINCT FROM EXCLUDED.title OR conversations.archived_at IS NOT NULL;

  INSERT INTO public.conversations (kind, channel_key, title, is_group, created_by, team_user_id)
  SELECT 'channel', 'team:' || p.id::text, p.name, true, NULL, p.id
  FROM public.profiles p
  JOIN public.user_roles r ON r.user_id = p.id
  WHERE r.role = 'montor'
  ON CONFLICT (channel_key) DO UPDATE
    SET title = EXCLUDED.title, team_user_id = EXCLUDED.team_user_id, archived_at = NULL
    WHERE conversations.title IS DISTINCT FROM EXCLUDED.title
       OR conversations.team_user_id IS DISTINCT FROM EXCLUDED.team_user_id
       OR conversations.archived_at IS NOT NULL;

  UPDATE public.conversations c
  SET archived_at = now()
  WHERE c.kind = 'channel'
    AND c.channel_key LIKE 'team:%'
    AND c.archived_at IS NULL
    AND (c.team_user_id IS NULL
         OR NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = c.team_user_id AND r.role = 'montor'));

  WITH everyone AS (
    SELECT p.id FROM public.profiles p JOIN public.user_roles r ON r.user_id = p.id
  ), office AS (
    SELECT p.id FROM public.profiles p JOIN public.user_roles r ON r.user_id = p.id
    WHERE r.is_admin OR r.role IN ('seller', 'coordinator')
  ), channels AS (
    SELECT id, channel_key, team_user_id FROM public.conversations
    WHERE kind = 'channel' AND archived_at IS NULL
  ), desired AS (
    SELECT c.id AS conversation_id, e.id AS user_id FROM channels c CROSS JOIN everyone e WHERE c.channel_key = 'alla'
    UNION
    SELECT c.id, o.id FROM channels c CROSS JOIN office o WHERE c.channel_key = 'kontoret' OR c.channel_key LIKE 'team:%'
    UNION
    SELECT c.id, p.id FROM channels c JOIN public.profiles p ON p.id = c.team_user_id WHERE c.channel_key LIKE 'team:%'
  ), removed AS (
    DELETE FROM public.conversation_members m
    USING channels c
    WHERE m.conversation_id = c.id
      AND NOT EXISTS (SELECT 1 FROM desired d WHERE d.conversation_id = m.conversation_id AND d.user_id = m.user_id)
    RETURNING m.conversation_id
  )
  INSERT INTO public.conversation_members (conversation_id, user_id, last_read_at)
  SELECT d.conversation_id, d.user_id, now() FROM desired d
  ON CONFLICT (conversation_id, user_id) DO NOTHING;
END
$$;

REVOKE ALL ON FUNCTION public.chat_sync_channels() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_sync_channels() TO service_role;

-- Felsäker trigger: ett fel i synken får aldrig stoppa en användare eller ett rollbyte.
CREATE OR REPLACE FUNCTION public.chat_sync_channels_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.chat_sync_channels();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'chat_sync_channels failed (% on %): %', TG_OP, TG_TABLE_NAME, SQLERRM;
  END;
  RETURN NULL;
END
$$;

REVOKE ALL ON FUNCTION public.chat_sync_channels_trigger() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS chat_sync_channels_on_user_roles ON public.user_roles;
CREATE TRIGGER chat_sync_channels_on_user_roles
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH STATEMENT EXECUTE FUNCTION public.chat_sync_channels_trigger();

DROP TRIGGER IF EXISTS chat_sync_channels_on_profiles ON public.profiles;
CREATE TRIGGER chat_sync_channels_on_profiles
  AFTER INSERT OR UPDATE OF name OR DELETE ON public.profiles
  FOR EACH STATEMENT EXECUTE FUNCTION public.chat_sync_channels_trigger();

-- start_conversation: sätter kind och matchar bara befintliga direktchattar.
CREATE OR REPLACE FUNCTION public.start_conversation(p_user_ids uuid[], p_title text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE ids uuid[]; result uuid; me uuid := auth.uid();
BEGIN
 IF me IS NULL THEN RAISE EXCEPTION 'Du måste vara inloggad'; END IF;
 SELECT array_agg(DISTINCT u ORDER BY u) INTO ids FROM unnest(array_append(p_user_ids, me)) u WHERE u IS NOT NULL;
 IF cardinality(ids) < 2 THEN RAISE EXCEPTION 'Välj minst en mottagare'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ids) u WHERE NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id = u)) THEN RAISE EXCEPTION 'Mottagaren finns inte'; END IF;
 IF cardinality(ids) = 2 THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(ids::text, 0));
  SELECT c.id INTO result FROM public.conversations c
   WHERE c.kind = 'direct'
     AND (SELECT array_agg(m.user_id ORDER BY m.user_id) FROM public.conversation_members m WHERE m.conversation_id = c.id) = ids
   LIMIT 1;
  IF result IS NOT NULL THEN RETURN result; END IF;
 END IF;
 INSERT INTO public.conversations(created_by, is_group, title, kind)
 VALUES (me, cardinality(ids) > 2, nullif(trim(p_title), ''), CASE WHEN cardinality(ids) = 2 THEN 'direct' ELSE 'group' END)
 RETURNING id INTO result;
 INSERT INTO public.conversation_members(conversation_id, user_id) SELECT result, unnest(ids);
 RETURN result;
END
$$;

REVOKE ALL ON FUNCTION public.start_conversation(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_conversation(uuid[], text) TO authenticated, service_role;

-- Översikt i en fråga. SECURITY INVOKER: RLS avgör vad som syns.
CREATE OR REPLACE FUNCTION public.chat_overview()
RETURNS TABLE (
  id uuid, kind text, channel_key text, team_user_id uuid, is_group boolean, title text,
  created_at timestamptz, member_ids uuid[], last_read_at timestamptz, unread integer, latest jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT c.id, c.kind, c.channel_key, c.team_user_id, c.is_group, c.title, c.created_at,
    coalesce((SELECT array_agg(m.user_id ORDER BY m.user_id) FROM public.conversation_members m WHERE m.conversation_id = c.id), '{}'::uuid[]),
    me.last_read_at,
    (SELECT count(*)::integer FROM public.messages x
      WHERE x.conversation_id = c.id AND x.sender_id <> me.user_id
        AND (me.last_read_at IS NULL OR x.created_at > me.last_read_at)),
    (SELECT jsonb_build_object('id', l.id, 'conversation_id', l.conversation_id, 'sender_id', l.sender_id, 'body', l.body,
              'created_at', l.created_at, 'case_id', l.case_id, 'attachments', l.attachments)
       FROM public.messages l WHERE l.conversation_id = c.id
       ORDER BY l.created_at DESC, l.id DESC LIMIT 1)
  FROM public.conversation_members me
  JOIN public.conversations c ON c.id = me.conversation_id
  WHERE me.user_id = auth.uid() AND c.archived_at IS NULL
$$;

REVOKE ALL ON FUNCTION public.chat_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_overview() TO authenticated, service_role;

SELECT public.chat_sync_channels();