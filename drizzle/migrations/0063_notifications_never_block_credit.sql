CREATE OR REPLACE FUNCTION public.notify_order_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE team_name text; a text:=public.auth_user_name(); l jsonb:=jsonb_build_object('type','a_order','id',NEW.id); label text:=CASE WHEN NEW.order_kind='service' THEN 'Serviceorder' ELSE 'A-order' END; orig_no text;
BEGIN
 SELECT name INTO team_name FROM public.montor_teams WHERE id=NEW.team_id;
 IF NEW.credited_from_order_id IS NOT NULL THEN
   SELECT invoice_number INTO orig_no FROM public.a_orders WHERE id=NEW.credited_from_order_id;
 END IF;
 IF NEW.order_sent_at IS NOT NULL AND (TG_OP='INSERT' OR NEW.order_sent_at IS DISTINCT FROM OLD.order_sent_at) THEN
   PERFORM public.notify_montor_team(team_name,'a_order_sent',label||coalesce(' #'||NEW.order_number,'')||' skickades till dig',NEW.customer_address,l,a);
 END IF;
 IF NEW.invoice_sent_at IS NOT NULL AND (TG_OP='INSERT' OR NEW.invoice_sent_at IS DISTINCT FROM OLD.invoice_sent_at) THEN
   IF NEW.credited_from_order_id IS NOT NULL THEN
     PERFORM public.notify_montor_team(team_name,'a_order_invoiced','Kreditfaktura '||coalesce(NEW.invoice_number,'')||' skapad'||coalesce(' (avser '||orig_no||')',''),NEW.customer_address,l,a);
   ELSE
     PERFORM public.notify_montor_team(team_name,'a_order_invoiced','Faktura '||coalesce(NEW.invoice_number,'')||' skapad'||coalesce(' för #'||NEW.order_number,''),NEW.customer_address,l,a);
   END IF;
 END IF;
 IF NEW.paid_at IS NOT NULL AND (TG_OP='INSERT' OR NEW.paid_at IS DISTINCT FROM OLD.paid_at) THEN
   IF NEW.credited_from_order_id IS NOT NULL THEN
     PERFORM public.notify_montor_team(team_name,'a_order_paid','Kreditfaktura '||coalesce(NEW.invoice_number,'')||' är kvittad',NEW.customer_address,l,a);
   ELSE
     PERFORM public.notify_montor_team(team_name,'a_order_paid','Faktura '||coalesce(NEW.invoice_number,'')||' är betald',NEW.customer_address,l,a);
   END IF;
 END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.notify_user(p_user uuid, p_kind text, p_title text, p_body text, p_link jsonb, p_actor text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.notifications(user_id,kind,title,body,link,actor)
  SELECT id,p_kind,coalesce(p_title,'Notis'),p_body,p_link,p_actor
  FROM public.profiles WHERE id=p_user AND name IS DISTINCT FROM p_actor;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_user failed (kind=%, user=%): %', p_kind, p_user, SQLERRM;
END $function$;