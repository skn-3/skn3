-- Chatt: kanalerna följer aktiva montörsteam.
-- Ett montörskonto är ett aktivt team bara om montor_teams har en rad med is_active = true
-- och exakt samma namn (montor_teams.name = profiles.name), samma jämförelse som RLS
-- (montor_teams.name = auth_user_name()) och Kalenderkopplingens "Saknar inloggning".

CREATE OR REPLACE FUNCTION public.chat_active_team_accounts()
RETURNS TABLE (user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id
    FROM public.profiles p
    JOIN public.user_roles r ON r.user_id = p.id AND r.role = 'montor'
   WHERE EXISTS (SELECT 1 FROM public.montor_teams t WHERE t.is_active AND t.name = p.name)
$$;

REVOKE ALL ON FUNCTION public.chat_active_team_accounts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_active_team_accounts() TO service_role;

COMMENT ON FUNCTION public.chat_active_team_accounts() IS 'Single definition of an active team account: montor role plus an active montor_teams row with exactly the same name.';

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

  -- En teamkanal per aktivt team. En arkiverad kanal kommer tillbaka med historiken.
  INSERT INTO public.conversations (kind, channel_key, title, is_group, created_by, team_user_id)
  SELECT 'channel', 'team:' || p.id::text, p.name, true, NULL, p.id
  FROM public.profiles p
  JOIN public.chat_active_team_accounts() a ON a.user_id = p.id
  ON CONFLICT (channel_key) DO UPDATE
    SET title = EXCLUDED.title, team_user_id = EXCLUDED.team_user_id, archived_at = NULL
    WHERE conversations.title IS DISTINCT FROM EXCLUDED.title
       OR conversations.team_user_id IS DISTINCT FROM EXCLUDED.team_user_id
       OR conversations.archived_at IS NOT NULL;

  -- Teamkanaler utan aktivt team arkiveras. Inget raderas.
  UPDATE public.conversations c
  SET archived_at = now()
  WHERE c.kind = 'channel'
    AND c.channel_key LIKE 'team:%'
    AND c.archived_at IS NULL
    AND (c.team_user_id IS NULL
         OR NOT EXISTS (SELECT 1 FROM public.chat_active_team_accounts() a WHERE a.user_id = c.team_user_id));

  WITH office AS (
    SELECT p.id FROM public.profiles p JOIN public.user_roles r ON r.user_id = p.id
    WHERE r.is_admin OR r.role IN ('seller', 'coordinator')
  ), everyone AS (
    SELECT id FROM office
    UNION
    SELECT a.user_id FROM public.chat_active_team_accounts() a
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

COMMENT ON COLUMN public.conversations.archived_at IS 'Channels are never deleted; a team channel whose account is no longer an active team (chat_active_team_accounts) is archived and returns with its history when the team becomes active again.';

-- Felsäker satsvis trigger på montor_teams: samma trigger-funktion som user_roles och profiles.
DROP TRIGGER IF EXISTS chat_sync_channels_on_montor_teams ON public.montor_teams;
CREATE TRIGGER chat_sync_channels_on_montor_teams
  AFTER INSERT OR UPDATE OF is_active, name OR DELETE ON public.montor_teams
  FOR EACH STATEMENT EXECUTE FUNCTION public.chat_sync_channels_trigger();

-- Kortet Notiser: bara kontoret och aktiva team.
CREATE OR REPLACE FUNCTION public.push_admin_overview()
RETURNS TABLE (user_id uuid, name text, role text, is_admin boolean, devices integer, last_success_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND (r.is_admin OR r.role::text = 'coordinator')) THEN
    RAISE EXCEPTION 'Bara admin och koordinator' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT p.id, p.name, min(r.role::text), bool_or(r.is_admin), count(DISTINCT s.id)::integer, max(s.last_success_at)
      FROM public.profiles p
      JOIN public.user_roles r ON r.user_id = p.id
      LEFT JOIN public.push_subscriptions s ON s.user_id = p.id
     WHERE r.is_admin OR r.role IN ('seller', 'coordinator')
        OR EXISTS (SELECT 1 FROM public.chat_active_team_accounts() a WHERE a.user_id = p.id)
     GROUP BY p.id, p.name
     ORDER BY p.name;
END $$;
REVOKE ALL ON FUNCTION public.push_admin_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.push_admin_overview() TO authenticated, service_role;

SELECT public.chat_sync_channels();