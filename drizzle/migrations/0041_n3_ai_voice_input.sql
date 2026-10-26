ALTER TABLE public.ai_usage ADD COLUMN kind text NOT NULL DEFAULT 'chat';
ALTER TABLE public.ai_usage ADD CONSTRAINT ai_usage_kind_check CHECK (kind IN ('chat','action','transcribe'));
ALTER TABLE public.ai_usage ADD COLUMN audio_seconds int;
CREATE INDEX ai_usage_transcribe_daily ON public.ai_usage (user_id, created_at) WHERE kind = 'transcribe';
ALTER TABLE public.ai_settings ADD COLUMN voice_enabled boolean NOT NULL DEFAULT true;
GRANT UPDATE (voice_enabled) ON public.ai_settings TO authenticated;