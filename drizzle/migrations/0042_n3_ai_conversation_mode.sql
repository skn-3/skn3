ALTER TABLE public.ai_settings ADD COLUMN tts_enabled boolean NOT NULL DEFAULT true, ADD COLUMN tts_model text NOT NULL DEFAULT 'openai/gpt-4o-mini-tts', ADD COLUMN tts_voice text NOT NULL DEFAULT 'marin', ADD COLUMN daily_tts_characters int NOT NULL DEFAULT 20000 CHECK (daily_tts_characters >= 0);
GRANT UPDATE(tts_enabled,tts_model,tts_voice,daily_tts_characters) ON public.ai_settings TO authenticated;
ALTER TABLE public.ai_usage DROP CONSTRAINT ai_usage_kind_check;
ALTER TABLE public.ai_usage ADD CONSTRAINT ai_usage_kind_check CHECK (kind IN ('chat','action','transcribe','tts'));
ALTER TABLE public.ai_usage ADD COLUMN tts_characters int;
ALTER TABLE public.ai_messages ADD COLUMN kind text NOT NULL DEFAULT 'chat' CHECK (kind IN ('chat','voice'));
CREATE INDEX ai_usage_tts_daily ON public.ai_usage(user_id,created_at) WHERE kind='tts';
CREATE OR REPLACE FUNCTION public.ai_reserve_tts(p_user_id uuid,p_characters int,p_message_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.ai_settings%ROWTYPE; consumed bigint; usage_id uuid; BEGIN
PERFORM pg_advisory_xact_lock(hashtextextended('tts:'||p_user_id::text,0));
SELECT * INTO STRICT s FROM public.ai_settings WHERE id=1;
IF NOT s.enabled OR NOT s.tts_enabled THEN RETURN jsonb_build_object('skipped','disabled'); END IF;
IF s.gateway_error IS NOT NULL THEN RETURN jsonb_build_object('skipped','error','error',s.gateway_error); END IF;
IF p_characters<1 OR p_characters>600 THEN RAISE EXCEPTION 'Invalid speech length'; END IF;
SELECT coalesce(sum(tts_characters),0) INTO consumed FROM public.ai_usage WHERE user_id=p_user_id AND kind='tts' AND created_at>=date_trunc('day',now() AT TIME ZONE 'Europe/Stockholm') AT TIME ZONE 'Europe/Stockholm';
IF consumed+p_characters>s.daily_tts_characters THEN RETURN jsonb_build_object('skipped','limit'); END IF;
INSERT INTO public.ai_usage(user_id,message_id,model,kind,status,tts_characters) VALUES(p_user_id,p_message_id,s.tts_model,'tts','ok',p_characters) RETURNING id INTO usage_id;
RETURN jsonb_build_object('usage_id',usage_id,'model',s.tts_model,'voice',s.tts_voice); END; $$;
REVOKE ALL ON FUNCTION public.ai_reserve_tts(uuid,int,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_reserve_tts(uuid,int,uuid) TO service_role;