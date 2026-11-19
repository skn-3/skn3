-- Chatt etapp 1 del 3: push-notiser för chattmeddelanden.

-- Enheter som tar emot push. Klienten läser och tar bort sina egna rader; skrivning bara via push_subscribe.
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  device_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  failure_count integer NOT NULL DEFAULT 0,
  CONSTRAINT push_subscriptions_endpoint_check CHECK (endpoint ~ '^https://' AND length(endpoint) <= 2048),
  CONSTRAINT push_subscriptions_keys_check CHECK (length(p256dh) BETWEEN 1 AND 200 AND length(auth) BETWEEN 1 AND 100),
  CONSTRAINT push_subscriptions_text_check CHECK ((user_agent IS NULL OR length(user_agent) <= 512) AND (device_label IS NULL OR length(device_label) <= 80)),
  CONSTRAINT push_subscriptions_failure_check CHECK (failure_count >= 0)
);
CREATE INDEX push_subscriptions_user_idx ON public.push_subscriptions (user_id);

REVOKE ALL ON public.push_subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Egna enheter kan läsas" ON public.push_subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Egna enheter kan tas bort" ON public.push_subscriptions FOR DELETE TO authenticated USING (user_id = auth.uid());
COMMENT ON TABLE public.push_subscriptions IS 'Web Push-prenumerationer per enhet. Skrivs bara via push_subscribe (upsert på endpoint, följer den inloggade) och av chat-push med service_role.';

-- Serverns nycklar och återanrop. Bara service_role; RLS på utan policys (samma mönster som drive_sync_runtime).
CREATE TABLE public.push_runtime (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  vapid_public_key text,
  vapid_private_jwk jsonb,
  callback_url text,
  callback_bearer text,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.push_runtime FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.push_runtime TO service_role;
ALTER TABLE public.push_runtime ENABLE ROW LEVEL SECURITY;
INSERT INTO public.push_runtime (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
COMMENT ON TABLE public.push_runtime IS 'VAPID-nyckelpar och återanrop för chat-push. Den privata nyckeln lämnar aldrig servern.';

-- Registrera enheten på den inloggade. En delad enhet följer den som är inloggad.
CREATE OR REPLACE FUNCTION public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text, p_device_label text)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  rid uuid;
BEGIN
  IF uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid) THEN
    RAISE EXCEPTION 'Inte inloggad' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, device_label)
  VALUES (uid, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 512), left(p_device_label, 80))
  ON CONFLICT (endpoint) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    p256dh = EXCLUDED.p256dh,
    auth = EXCLUDED.auth,
    user_agent = EXCLUDED.user_agent,
    device_label = EXCLUDED.device_label,
    failure_count = 0,
    created_at = CASE WHEN push_subscriptions.user_id = EXCLUDED.user_id THEN push_subscriptions.created_at ELSE now() END,
    last_success_at = CASE WHEN push_subscriptions.user_id = EXCLUDED.user_id THEN push_subscriptions.last_success_at ELSE NULL END
  RETURNING id INTO rid;
  RETURN rid;
END $$;
REVOKE ALL ON FUNCTION public.push_subscribe(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.push_subscribe(text, text, text, text, text) TO authenticated, service_role;

-- Ta bort enheten om den är anroparens (RLS på DELETE avgör).
CREATE OR REPLACE FUNCTION public.push_unsubscribe(p_endpoint text)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH d AS (DELETE FROM public.push_subscriptions WHERE endpoint = p_endpoint AND user_id = auth.uid() RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM d);
$$;
REVOKE ALL ON FUNCTION public.push_unsubscribe(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.push_unsubscribe(text) TO authenticated, service_role;

-- Totalt antal olästa per mottagare, med samma regel som chat_overview. Bara service_role (chat-push).
CREATE OR REPLACE FUNCTION public.push_unread_counts(p_user_ids uuid[])
RETURNS TABLE (user_id uuid, unread integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id,
    (SELECT count(*)::integer
       FROM public.conversation_members me
       JOIN public.conversations c ON c.id = me.conversation_id AND c.archived_at IS NULL
       JOIN public.messages x ON x.conversation_id = me.conversation_id
      WHERE me.user_id = u.id AND x.sender_id <> me.user_id
        AND (me.last_read_at IS NULL OR x.created_at > me.last_read_at))
  FROM unnest(p_user_ids) AS u(id);
$$;
REVOKE ALL ON FUNCTION public.push_unread_counts(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_unread_counts(uuid[]) TO service_role;

-- Översikt för kontoret: vem som har slagit på notiser. Bara admin och koordinator.
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
     GROUP BY p.id, p.name
     ORDER BY p.name;
END $$;
REVOKE ALL ON FUNCTION public.push_admin_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.push_admin_overview() TO authenticated, service_role;

-- Nytt meddelande: be chat-push skicka. Felsäker: ett fel stoppar aldrig att meddelandet sparas.
CREATE OR REPLACE FUNCTION public.chat_push_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u text; b text; e boolean;
BEGIN
  BEGIN
    SELECT callback_url, callback_bearer, enabled INTO u, b, e FROM public.push_runtime WHERE id = 1;
    IF u IS NULL OR b IS NULL OR NOT coalesce(e, false) THEN RETURN NEW; END IF;
    -- Inget anrop när ingen annan medlem har en enhet.
    IF NOT EXISTS (
      SELECT 1 FROM public.conversation_members m
      JOIN public.push_subscriptions s ON s.user_id = m.user_id
      WHERE m.conversation_id = NEW.conversation_id AND m.user_id <> NEW.sender_id
    ) THEN RETURN NEW; END IF;
    PERFORM net.http_post(
      url := u,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || b),
      body := jsonb_build_object('action', 'message', 'message_id', NEW.id),
      timeout_milliseconds := 30000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'chat_push_on_message failed (message=%): %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.chat_push_on_message() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER messages_chat_push AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.chat_push_on_message();