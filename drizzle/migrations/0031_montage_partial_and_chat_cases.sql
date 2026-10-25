ALTER TABLE public.cases ADD COLUMN montage_partial_note text, ADD COLUMN montage_partial_at timestamptz;
CREATE OR REPLACE VIEW public.cases_montor WITH (security_invoker=true) AS SELECT id,created_at,address,customer_name,customer_phone,customer_email,seller,team,status,offer_number,extra_hours_requested,extra_hours_approved,km_date,montage_date,delivery_date,notes,updated_at,visit_id,imported,media_consent,carry_help_needed,city,scheduled_delivery,km_time,montage_time,delivery_time,delivery_week,delivery_year,km_team,units,order_number,status_changed_at,public_token,montor_notes,is_gotland,klimat_status,montage_partial_note,montage_partial_at FROM public.cases;
ALTER TABLE public.messages ADD COLUMN case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL;
GRANT INSERT(case_id) ON public.messages TO authenticated;
CREATE INDEX messages_case_id ON public.messages(case_id);
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
   ELSE
    notification_kind:='montor_event';
    notification_title:='Ny händelse från '||NEW.created_by||': '||address_text;
  END CASE;
 END IF;
 PERFORM public.notify_staff(seller_name,notification_kind,notification_title,left(notification_body,160),link,actor);
 RETURN NEW;
END $$;
