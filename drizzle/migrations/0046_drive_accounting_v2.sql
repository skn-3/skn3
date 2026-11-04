-- lovable-cron-fallback-reviewed: daily audit is genuinely time-based (once per day); archive work remains event-driven via drive_sync_wake.
ALTER TABLE public.drive_sync ADD COLUMN IF NOT EXISTS review_reason text, ADD COLUMN IF NOT EXISTS review_code text, ADD COLUMN IF NOT EXISTS review_override boolean NOT NULL DEFAULT false;
ALTER TABLE public.drive_sync_settings ADD COLUMN IF NOT EXISTS earliest_open_date date NOT NULL DEFAULT '2026-08-01', ADD COLUMN IF NOT EXISTS last_audit_at timestamptz, ADD COLUMN IF NOT EXISTS last_audit_result jsonb;
GRANT UPDATE(earliest_open_date) ON public.drive_sync_settings TO authenticated;
ALTER TABLE public.case_documents ADD COLUMN IF NOT EXISTS due_date date, ADD COLUMN IF NOT EXISTS drive_review_reason text;

CREATE TABLE public.drive_misfiled (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_sync_id uuid REFERENCES public.drive_sync(id) ON DELETE SET NULL,
  drive_file_id text NOT NULL UNIQUE,
  drive_folder_path text,
  file_name text NOT NULL,
  reason text NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text
);
REVOKE ALL ON public.drive_misfiled FROM anon, authenticated;
GRANT SELECT ON public.drive_misfiled TO authenticated;
GRANT UPDATE(resolved_at, resolved_by) ON public.drive_misfiled TO authenticated;
GRANT ALL ON public.drive_misfiled TO service_role;
ALTER TABLE public.drive_misfiled ENABLE ROW LEVEL SECURITY;
CREATE POLICY drive_misfiled_read ON public.drive_misfiled FOR SELECT TO authenticated USING (public.auth_is_admin() OR public.auth_user_role() = 'coordinator');
CREATE POLICY drive_misfiled_resolve ON public.drive_misfiled FOR UPDATE TO authenticated USING (public.auth_is_admin() OR public.auth_user_role() = 'coordinator') WITH CHECK (public.auth_is_admin() OR public.auth_user_role() = 'coordinator');

-- Alla uppladdade dokument och kostnadskvitton väcker synken händelsestyrt.
CREATE OR REPLACE FUNCTION public.drive_sync_source_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$ DECLARE h boolean:=false; BEGIN IF TG_TABLE_NAME='a_orders' THEN h:=NEW.status IN ('invoiced','credited') AND NEW.invoice_number IS NOT NULL AND NEW.pdf_path IS NOT NULL; ELSIF TG_TABLE_NAME='montor_debit_invoices' THEN h:=NEW.pdf_path IS NOT NULL; ELSIF TG_TABLE_NAME='case_documents' THEN h:=NEW.file_path IS NOT NULL; ELSIF TG_TABLE_NAME='case_costs' THEN h:=NEW.receipt_path IS NOT NULL OR NEW.receipt_url IS NOT NULL; ELSIF TG_TABLE_NAME='uppdrag' THEN h:=NEW.handpenning_pdf_path IS NOT NULL OR NEW.slutfaktura_pdf_path IS NOT NULL; ELSIF TG_TABLE_NAME='offers' THEN h:=NEW.signed_pdf_path IS NOT NULL OR NEW.confirmation_pdf_path IS NOT NULL; END IF; IF h THEN UPDATE public.drive_sync_runtime SET generation=generation+1 WHERE id=1; PERFORM public.drive_sync_wake(); END IF; RETURN NEW; EXCEPTION WHEN OTHERS THEN RETURN NEW; END $function$;
REVOKE ALL ON FUNCTION public.drive_sync_source_changed() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS drive_sync_payout ON public.case_documents;
CREATE TRIGGER drive_sync_payout AFTER INSERT OR UPDATE OF file_path,doc_type,invoice_date,drive_review_reason ON public.case_documents FOR EACH ROW EXECUTE FUNCTION public.drive_sync_source_changed();
CREATE TRIGGER drive_sync_cost_receipt AFTER INSERT OR UPDATE OF receipt_path,receipt_url ON public.case_costs FOR EACH ROW EXECUTE FUNCTION public.drive_sync_source_changed();

-- Ändrat earliest_open_date väcker synken så att släppta dokument arkiveras.
CREATE OR REPLACE FUNCTION public.drive_sync_settings_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE j bigint; BEGIN IF NEW.root_folder_id IS DISTINCT FROM OLD.root_folder_id OR NEW.kunder_folder_id IS DISTINCT FROM OLD.kunder_folder_id THEN UPDATE public.drive_sync_runtime SET callback_url=NULL,callback_bearer=NULL WHERE id=1; END IF; IF NOT NEW.enabled OR NEW.root_folder_id IS DISTINCT FROM OLD.root_folder_id OR NEW.kunder_folder_id IS DISTINCT FROM OLD.kunder_folder_id THEN FOR j IN SELECT jobid FROM cron.job WHERE jobname='drive-sync-every-15-min' LOOP PERFORM cron.unschedule(j); END LOOP; ELSIF NEW.enabled AND (NOT OLD.enabled OR NEW.earliest_open_date IS DISTINCT FROM OLD.earliest_open_date) THEN PERFORM public.drive_sync_wake(); END IF; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS drive_settings_wake ON public.drive_sync_settings;
CREATE TRIGGER drive_settings_wake AFTER UPDATE OF enabled,root_folder_id,kunder_folder_id,earliest_open_date ON public.drive_sync_settings FOR EACH ROW EXECUTE FUNCTION public.drive_sync_settings_changed();

-- Daglig kontroll av felplacerade filer, med samma autentisering som drive_sync_wake.
CREATE OR REPLACE FUNCTION public.drive_sync_audit_wake() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE u text; b text; BEGIN IF NOT EXISTS(SELECT 1 FROM public.drive_sync_settings WHERE id=1 AND enabled) THEN RETURN; END IF; SELECT callback_url,callback_bearer INTO u,b FROM public.drive_sync_runtime WHERE id=1; IF u IS NULL OR b IS NULL THEN RETURN; END IF; PERFORM net.http_post(url:=u,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||b),body:='{"action":"audit"}'::jsonb,timeout_milliseconds:=180000); END $$;
REVOKE ALL ON FUNCTION public.drive_sync_audit_wake() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.drive_sync_audit_wake() TO service_role;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='drive-sync-audit-daily') THEN PERFORM cron.schedule('drive-sync-audit-daily','15 3 * * *','SELECT public.drive_sync_audit_wake();'); END IF; END $$;
