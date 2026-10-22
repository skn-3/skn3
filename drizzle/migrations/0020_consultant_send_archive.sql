ALTER TABLE public.consultant_payouts
  ADD COLUMN IF NOT EXISTS sent_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS invoice_drive_payer_file_id text,
  ADD COLUMN IF NOT EXISTS invoice_drive_payer_link text,
  ADD COLUMN IF NOT EXISTS invoice_drive_payer_folder text,
  ADD COLUMN IF NOT EXISTS spec_drive_file_id text,
  ADD COLUMN IF NOT EXISTS archive_error text;
ALTER TABLE public.consultants
  ADD COLUMN IF NOT EXISTS cc_email text,
  ADD COLUMN IF NOT EXISTS log_backfilled_at timestamptz;
UPDATE public.consultants SET cc_email = 'invoice@malke.se' WHERE company_name = 'VPLG AB' AND cc_email IS NULL;