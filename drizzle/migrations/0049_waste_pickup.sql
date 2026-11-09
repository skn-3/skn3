ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS waste_pickup_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS waste_pickup_requested_by text,
  ADD COLUMN IF NOT EXISTS waste_pickup_note text,
  ADD COLUMN IF NOT EXISTS waste_pickup_earliest date,
  ADD COLUMN IF NOT EXISTS waste_pickup_booked_at timestamptz,
  ADD COLUMN IF NOT EXISTS waste_pickup_booked_by text,
  ADD COLUMN IF NOT EXISTS waste_pickup_date date;

COMMENT ON COLUMN public.cases.waste_pickup_requested_at IS 'Skräphämtning (Ragn-Sells) begärd av montör eller personal. Ändrar inte status.';

-- Montörer får begära hämtning på sina ärenden men aldrig boka eller ändra en bokad hämtning.
CREATE OR REPLACE FUNCTION public.cases_protect_waste_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.auth_user_role() = 'montor' THEN
    IF NEW.waste_pickup_booked_at IS DISTINCT FROM OLD.waste_pickup_booked_at
       OR NEW.waste_pickup_booked_by IS DISTINCT FROM OLD.waste_pickup_booked_by
       OR NEW.waste_pickup_date IS DISTINCT FROM OLD.waste_pickup_date THEN
      RAISE EXCEPTION 'Hämtningen bokas av kontoret';
    END IF;
    IF OLD.waste_pickup_booked_at IS NOT NULL AND (
         NEW.waste_pickup_requested_at IS DISTINCT FROM OLD.waste_pickup_requested_at
      OR NEW.waste_pickup_requested_by IS DISTINCT FROM OLD.waste_pickup_requested_by
      OR NEW.waste_pickup_note IS DISTINCT FROM OLD.waste_pickup_note
      OR NEW.waste_pickup_earliest IS DISTINCT FROM OLD.waste_pickup_earliest) THEN
      RAISE EXCEPTION 'Hämtningen är redan bokad – kontakta kontoret för ändring';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS cases_protect_waste_booking ON public.cases;
CREATE TRIGGER cases_protect_waste_booking
  BEFORE UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.cases_protect_waste_booking();

-- Montörsvyn: lägg till hämtfälten och återställ security_invoker (tappades i 0043),
-- så att vyn följer RLS på cases och aldrig kan läsas utan inloggning.
CREATE OR REPLACE VIEW public.cases_montor WITH (security_invoker = true) AS
SELECT id,created_at,address,customer_name,customer_phone,customer_email,seller,team,status,offer_number,
       extra_hours_requested,extra_hours_approved,km_date,montage_date,delivery_date,notes,updated_at,visit_id,
       imported,media_consent,carry_help_needed,city,scheduled_delivery,km_time,montage_time,delivery_time,
       delivery_week,delivery_year,km_team,units,order_number,status_changed_at,public_token,montor_notes,
       is_gotland,klimat_status,montage_partial_note,montage_partial_at,extra_hours_approved_amount,
       waste_pickup_requested_at,waste_pickup_requested_by,waste_pickup_note,waste_pickup_earliest,
       waste_pickup_booked_at,waste_pickup_booked_by,waste_pickup_date
FROM public.cases;
REVOKE ALL ON public.cases_montor FROM anon;
GRANT SELECT ON public.cases_montor TO authenticated;
GRANT SELECT ON public.cases_montor TO service_role;

-- Notiser: begärd hämtning till personal (oavsett vem som begär), bokad hämtning till montörsteamet.
CREATE OR REPLACE FUNCTION public.notify_montor_case_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 address_text text;
 seller_name text;
 team_name text;
 actor text;
 link jsonb;
 notification_kind text;
 notification_title text;
 notification_body text:=NEW.description;
BEGIN
 IF NEW.case_id IS NULL THEN RETURN NEW; END IF;
 IF NEW.event_type IN ('cost','deviation','status_change','km_report','hours_request','notification','economy','update') THEN RETURN NEW; END IF;
 SELECT address,seller,team INTO address_text,seller_name,team_name FROM public.cases WHERE id=NEW.case_id;
 actor:=coalesce(public.auth_user_name(),NEW.created_by);
 link:=jsonb_build_object('type','case','id',NEW.case_id);
 IF NEW.event_type='waste_pickup_booked' THEN
  IF team_name IS NOT NULL THEN
   PERFORM public.notify_montor_team(team_name,'waste_pickup_booked','Ragn-Sells bokad: '||address_text,left(NEW.description,160),link,actor);
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.event_type='sheet_metal_order' THEN
  notification_kind:='sheet_metal';
  notification_title:='Plåt beställd: '||address_text;
 ELSIF NEW.event_type='waste_pickup_requested' THEN
  notification_kind:='waste_pickup';
  notification_title:='Skräp redo att hämtas: '||address_text;
 ELSE
  IF NOT public.is_montor_name(NEW.created_by) THEN RETURN NEW; END IF;
  CASE NEW.event_type
   WHEN 'montage_delrapport' THEN
    notification_kind:='montage_delrapport';
    notification_title:='Montage delrapporterat: '||address_text;
   WHEN 'kontrollmatning' THEN
    notification_kind:='kontrollmatning';
    notification_title:='Kontrollmätning inskickad: '||address_text;
   WHEN 'montage_booked' THEN
    notification_kind:='montage_booked_by_montor';
    notification_title:='Montage bokat av '||NEW.created_by||': '||address_text;
   WHEN 'montage_rescheduled' THEN
    notification_kind:='montage_rescheduled';
    notification_title:='Montagedatum ändrat av '||NEW.created_by||': '||address_text;
   WHEN 'deviation_resolved' THEN
    notification_kind:='deviation_resolved';
    notification_title:='Avvikelse löst av '||NEW.created_by||': '||address_text;
   WHEN 'note' THEN
    notification_kind:='note';
    notification_title:='Anteckning från '||NEW.created_by||': '||address_text;
    notification_body:=regexp_replace(NEW.description,'^Anteckning: ','');
   WHEN 'waste_pickup_cancelled' THEN
    notification_kind:='waste_pickup';
    notification_title:='Skräphämtning ångrad av '||NEW.created_by||': '||address_text;
   ELSE
    notification_kind:='montor_event';
    notification_title:='Ny händelse från '||NEW.created_by||': '||address_text;
  END CASE;
 END IF;
 PERFORM public.notify_staff(seller_name,notification_kind,notification_title,left(notification_body,160),link,actor);
 RETURN NEW;
END
$$;

CREATE INDEX IF NOT EXISTS cases_waste_pickup_open_idx
  ON public.cases (waste_pickup_requested_at)
  WHERE waste_pickup_requested_at IS NOT NULL AND waste_pickup_booked_at IS NULL;