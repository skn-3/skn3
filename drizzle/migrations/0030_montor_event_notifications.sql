CREATE OR REPLACE FUNCTION public.is_montor_name(p_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.id
  WHERE p.name=p_name AND r.role='montor'
 );
$$;
-- The migration guard requires authenticated EXECUTE on role-check helpers.
REVOKE ALL ON FUNCTION public.is_montor_name(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_montor_name(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_montor_case_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 address_text text;
 seller_name text;
 actor text;
 link jsonb;
 notification_kind text;
 notification_title text;
 notification_body text:=NEW.description;
BEGIN
 IF NEW.case_id IS NULL THEN RETURN NEW; END IF;
 IF NEW.event_type IN ('cost','deviation','status_change','km_report','hours_request','notification','economy','update') THEN RETURN NEW; END IF;
 SELECT address,seller INTO address_text,seller_name FROM public.cases WHERE id=NEW.case_id;
 actor:=coalesce(public.auth_user_name(),NEW.created_by);
 link:=jsonb_build_object('type','case','id',NEW.case_id);
 IF NEW.event_type='sheet_metal_order' THEN
  notification_kind:='sheet_metal';
  notification_title:='Plåt beställd: '||address_text;
 ELSE
  IF NOT public.is_montor_name(NEW.created_by) THEN RETURN NEW; END IF;
  CASE NEW.event_type
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
   ELSE
    notification_kind:='montor_event';
    notification_title:='Ny händelse från '||NEW.created_by||': '||address_text;
  END CASE;
 END IF;
 PERFORM public.notify_staff(seller_name,notification_kind,notification_title,left(notification_body,160),link,actor);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.notify_montor_case_event() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER notifications_case_event AFTER INSERT ON public.case_events
FOR EACH ROW EXECUTE FUNCTION public.notify_montor_case_event();

CREATE OR REPLACE FUNCTION public.notify_case_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a text:=public.auth_user_name(); l jsonb:=jsonb_build_object('type','case','id',NEW.id);
BEGIN
 IF NEW.team IS NOT NULL AND (TG_OP='INSERT' OR NEW.team IS DISTINCT FROM OLD.team) THEN PERFORM public.notify_montor_team(NEW.team,'case_assigned','Du är tilldelad montage: '||NEW.address,NULL,l,a); END IF;
 IF NEW.km_team IS NOT NULL AND (TG_OP='INSERT' OR NEW.km_team IS DISTINCT FROM OLD.km_team) THEN PERFORM public.notify_montor_team(NEW.km_team,'km_assigned','Du är tilldelad kontrollmätning: '||NEW.address,NULL,l,a); END IF;
 IF NEW.montage_date IS NOT NULL AND NEW.team IS NOT NULL AND (TG_OP='INSERT' OR NEW.montage_date IS DISTINCT FROM OLD.montage_date) THEN PERFORM public.notify_montor_team(NEW.team,'montage_booked','Montage bokat '||NEW.montage_date||CASE WHEN NEW.montage_time IS NOT NULL THEN ' kl '||to_char(NEW.montage_time,'HH24:MI') ELSE '' END||': '||NEW.address,NULL,l,a); END IF;
 IF (TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status) AND NEW.status IN('montage_klart','km_klar','vantar_godkannande') THEN PERFORM public.notify_staff(NEW.seller,NEW.status,CASE NEW.status WHEN 'montage_klart' THEN 'Montage klart: ' WHEN 'km_klar' THEN 'KM klar: ' ELSE 'Extra timmar begärda: ' END||NEW.address,CASE WHEN NEW.status='vantar_godkannande' THEN NEW.extra_hours_requested||' timmar' ELSE NULL END,l,a); END IF;
 IF (TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status) AND NEW.status='montage_pagar' THEN
  PERFORM public.notify_staff(NEW.seller,'montage_pagar','Montage påbörjat: '||NEW.address,NULL,l,a);
 END IF;
 IF NEW.km_date IS NOT NULL AND (TG_OP='INSERT' OR OLD.km_date IS DISTINCT FROM NEW.km_date) AND public.is_montor_name(a) THEN
  PERFORM public.notify_staff(NEW.seller,'km_booked_by_montor','KM bokad av '||a||': '||NEW.address,'Datum '||NEW.km_date,l,a);
 END IF;
 RETURN NEW;
END $$;
