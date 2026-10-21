alter table public.offers
  add column if not exists confirmation_pdf_path text,
  add column if not exists confirmation_sent_at timestamptz,
  add column if not exists confirmation_sent_by text,
  add column if not exists confirmation_sent_to text;

CREATE OR REPLACE FUNCTION public.drive_sync_source_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE h boolean:=false; BEGIN IF TG_TABLE_NAME='a_orders' THEN h:=NEW.status IN ('invoiced','credited') AND NEW.invoice_number IS NOT NULL AND NEW.pdf_path IS NOT NULL; ELSIF TG_TABLE_NAME='montor_debit_invoices' THEN h:=NEW.pdf_path IS NOT NULL; ELSIF TG_TABLE_NAME='case_documents' THEN h:=NEW.doc_type='mockfjards_payout' AND NEW.file_path IS NOT NULL; ELSIF TG_TABLE_NAME='uppdrag' THEN h:=NEW.handpenning_pdf_path IS NOT NULL OR NEW.slutfaktura_pdf_path IS NOT NULL; ELSIF TG_TABLE_NAME='offers' THEN h:=NEW.signed_pdf_path IS NOT NULL OR NEW.confirmation_pdf_path IS NOT NULL; END IF; IF h THEN UPDATE public.drive_sync_runtime SET generation=generation+1 WHERE id=1; PERFORM public.drive_sync_wake(); END IF; RETURN NEW; EXCEPTION WHEN OTHERS THEN RETURN NEW; END $function$;

DROP TRIGGER IF EXISTS drive_sync_offer ON public.offers;
CREATE TRIGGER drive_sync_offer AFTER INSERT OR UPDATE OF signed_pdf_path, confirmation_pdf_path ON public.offers FOR EACH ROW EXECUTE FUNCTION public.drive_sync_source_changed();