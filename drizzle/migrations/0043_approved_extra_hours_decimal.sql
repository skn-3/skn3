ALTER TABLE public.cases ADD COLUMN extra_hours_approved_amount numeric NOT NULL DEFAULT 0;
UPDATE public.cases SET extra_hours_approved_amount=extra_hours_approved;
ALTER TABLE public.cases ADD CONSTRAINT cases_approved_hours_amount_range CHECK (extra_hours_approved_amount>=0 AND extra_hours_approved_amount<=500 AND extra_hours_approved_amount<>'NaN'::numeric) NOT VALID;
COMMENT ON COLUMN public.cases.extra_hours_approved IS 'DEPRECATED: replaced by extra_hours_approved_amount; retained for legacy clients and synchronized to whole hours.';
CREATE OR REPLACE FUNCTION public.sync_approved_extra_hours() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
IF TG_OP='INSERT' THEN
 IF NEW.extra_hours_approved_amount=0 AND NEW.extra_hours_approved<>0 THEN NEW.extra_hours_approved_amount=NEW.extra_hours_approved; END IF;
ELSIF NEW.extra_hours_approved_amount IS NOT DISTINCT FROM OLD.extra_hours_approved_amount AND NEW.extra_hours_approved IS DISTINCT FROM OLD.extra_hours_approved THEN
 NEW.extra_hours_approved_amount=NEW.extra_hours_approved;
END IF;
NEW.extra_hours_approved=floor(NEW.extra_hours_approved_amount)::integer;
RETURN NEW; END; $$;
CREATE TRIGGER cases_sync_approved_hours BEFORE INSERT OR UPDATE ON public.cases FOR EACH ROW EXECUTE FUNCTION public.sync_approved_extra_hours();
CREATE OR REPLACE VIEW public.cases_montor AS SELECT id,created_at,address,customer_name,customer_phone,customer_email,seller,team,status,offer_number,extra_hours_requested,extra_hours_approved,km_date,montage_date,delivery_date,notes,updated_at,visit_id,imported,media_consent,carry_help_needed,city,scheduled_delivery,km_time,montage_time,delivery_time,delivery_week,delivery_year,km_team,units,order_number,status_changed_at,public_token,montor_notes,is_gotland,klimat_status,montage_partial_note,montage_partial_at,extra_hours_approved_amount FROM public.cases;