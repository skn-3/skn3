ALTER TABLE public.ai_usage DROP CONSTRAINT IF EXISTS ai_usage_kind_check;
ALTER TABLE public.ai_usage ADD CONSTRAINT ai_usage_kind_check CHECK (kind IN ('chat','action','transcribe','tts','kalkyl_tolka','kalkyl_granska','kalkyl_fraga'));
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS input_chars int;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS image_count int;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS pdf_count int;
COMMENT ON COLUMN public.ai_usage.input_chars IS 'kalkyl-ai: antal tecken i anteckning/fråga och underlag';
COMMENT ON COLUMN public.ai_usage.image_count IS 'kalkyl-ai: antal foton (sparas aldrig)';
COMMENT ON COLUMN public.ai_usage.pdf_count IS 'kalkyl-ai: antal PDF:er (sparas aldrig)';
CREATE INDEX IF NOT EXISTS ai_usage_kalkyl_daily ON public.ai_usage (user_id, created_at) WHERE kind LIKE 'kalkyl\_%';

-- Reserverar ett kalkyl-ai-anrop mot samma dagstak som N3prenad-AI (ai_settings.daily_message_limit).
-- Taket delas: dagens frågor i N3prenad-AI plus dagens kalkyl-ai-anrop (ok eller fel efter reservation).
CREATE OR REPLACE FUNCTION public.ai_reserve_kalkyl(p_user_id uuid, p_kind text, p_model text, p_input_chars int, p_image_count int, p_pdf_count int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.ai_settings%ROWTYPE; n int; u uuid; day_start timestamptz;
BEGIN
  IF p_kind NOT IN ('kalkyl_tolka','kalkyl_granska','kalkyl_fraga') THEN RAISE EXCEPTION 'Okänt läge %', p_kind; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  SELECT * INTO STRICT s FROM public.ai_settings WHERE id = 1;
  day_start := date_trunc('day', now() AT TIME ZONE 'Europe/Stockholm') AT TIME ZONE 'Europe/Stockholm';
  IF NOT s.enabled THEN
    INSERT INTO public.ai_usage(user_id, model, kind, status, input_chars, image_count, pdf_count) VALUES (p_user_id, p_model, p_kind, 'disabled', p_input_chars, p_image_count, p_pdf_count);
    RETURN jsonb_build_object('status', 'disabled');
  END IF;
  SELECT
    (SELECT count(*) FROM public.ai_messages a JOIN public.ai_threads b ON b.id = a.thread_id WHERE b.user_id = p_user_id AND a.role = 'user' AND a.created_at >= day_start)
    + (SELECT count(*) FROM public.ai_usage WHERE user_id = p_user_id AND kind LIKE 'kalkyl\_%' AND status IN ('ok','error') AND created_at >= day_start)
  INTO n;
  IF n >= s.daily_message_limit THEN
    INSERT INTO public.ai_usage(user_id, model, kind, status, input_chars, image_count, pdf_count) VALUES (p_user_id, p_model, p_kind, 'limit', p_input_chars, p_image_count, p_pdf_count);
    RETURN jsonb_build_object('status', 'limit');
  END IF;
  INSERT INTO public.ai_usage(user_id, model, kind, status, input_chars, image_count, pdf_count) VALUES (p_user_id, p_model, p_kind, 'ok', p_input_chars, p_image_count, p_pdf_count) RETURNING id INTO u;
  RETURN jsonb_build_object('status', 'ok', 'usage_id', u);
END $$;
REVOKE ALL ON FUNCTION public.ai_reserve_kalkyl(uuid, text, text, int, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_reserve_kalkyl(uuid, text, text, int, int, int) TO service_role;

-- N3prenad-AI räknar nu också dagens kalkyl-ai-anrop mot samma tak (oförändrat i övrigt).
CREATE OR REPLACE FUNCTION public.ai_begin_message(p_user_id uuid, p_message text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE t uuid; m uuid; n int; s public.ai_settings%ROWTYPE; BEGIN PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,0)); SELECT * INTO STRICT s FROM public.ai_settings WHERE id=1; IF NOT s.enabled THEN RETURN jsonb_build_object('status','disabled'); END IF; SELECT count(*) INTO n FROM public.ai_messages a JOIN public.ai_threads b ON b.id=a.thread_id WHERE b.user_id=p_user_id AND a.role='user' AND a.created_at>=date_trunc('day',now() AT TIME ZONE 'Europe/Stockholm') AT TIME ZONE 'Europe/Stockholm'; n := n + (SELECT count(*) FROM public.ai_usage WHERE user_id=p_user_id AND kind LIKE 'kalkyl\_%' AND status IN ('ok','error') AND created_at>=date_trunc('day',now() AT TIME ZONE 'Europe/Stockholm') AT TIME ZONE 'Europe/Stockholm'); IF n>=s.daily_message_limit THEN RETURN jsonb_build_object('status','limit'); END IF; SELECT id INTO t FROM public.ai_threads WHERE user_id=p_user_id AND archived_at IS NULL; IF t IS NULL THEN INSERT INTO public.ai_threads(user_id,title) VALUES(p_user_id,'N3prenad-AI') RETURNING id INTO t; END IF; INSERT INTO public.ai_messages(thread_id,role,content) VALUES(t,'user',p_message) RETURNING id INTO m; UPDATE public.ai_threads SET updated_at=now() WHERE id=t; RETURN jsonb_build_object('status','ok','thread_id',t,'message_id',m); END $$;
REVOKE ALL ON FUNCTION public.ai_begin_message(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_begin_message(uuid,text) TO service_role;