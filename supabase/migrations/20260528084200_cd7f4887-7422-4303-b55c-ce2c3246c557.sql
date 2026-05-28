ALTER TABLE public.deviations
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ny',
  ADD COLUMN IF NOT EXISTS action_type TEXT,
  ADD COLUMN IF NOT EXISTS action_taken_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS del1_order_number TEXT,
  ADD COLUMN IF NOT EXISTS del1_delivery_week INT,
  ADD COLUMN IF NOT EXISTS del1_delivery_year INT,
  ADD COLUMN IF NOT EXISTS factory_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS factory_email_to TEXT,
  ADD COLUMN IF NOT EXISTS action_log JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.deviations SET status = 'klar' WHERE resolved = true AND status = 'ny';