CREATE TABLE public.notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, kind text NOT NULL, title text NOT NULL, body text, link jsonb, actor text, created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz);
GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE(read_at) ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_read ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY notifications_mark ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX notifications_unread ON public.notifications(user_id, read_at, created_at DESC);
CREATE TABLE public.conversations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL REFERENCES public.profiles(id), is_group boolean NOT NULL DEFAULT false, title text);
GRANT SELECT ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.conversation_members (conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, last_read_at timestamptz, PRIMARY KEY(conversation_id,user_id));
GRANT SELECT ON public.conversation_members TO authenticated;
GRANT UPDATE(last_read_at) ON public.conversation_members TO authenticated;
GRANT ALL ON public.conversation_members TO service_role;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE, sender_id uuid NOT NULL REFERENCES public.profiles(id), body text NOT NULL CHECK (length(trim(body)) > 0 AND length(body) <= 10000), created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX messages_conversation_date ON public.messages(conversation_id,created_at);
CREATE FUNCTION public.is_conversation_member(p_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.conversation_members WHERE conversation_id=p_id AND user_id=auth.uid()) $$;
REVOKE ALL ON FUNCTION public.is_conversation_member(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid) TO authenticated;
CREATE POLICY conversations_read ON public.conversations FOR SELECT TO authenticated USING (public.is_conversation_member(id));
CREATE POLICY members_read ON public.conversation_members FOR SELECT TO authenticated USING (public.is_conversation_member(conversation_id));
CREATE POLICY members_mark ON public.conversation_members FOR UPDATE TO authenticated USING (user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY messages_read ON public.messages FOR SELECT TO authenticated USING(public.is_conversation_member(conversation_id));
CREATE POLICY messages_send ON public.messages FOR INSERT TO authenticated WITH CHECK(sender_id=auth.uid() AND public.is_conversation_member(conversation_id));
CREATE VIEW public.profiles_public AS SELECT p.id,p.name,r.role FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.id WHERE auth.uid() IS NOT NULL;
REVOKE ALL ON public.profiles_public FROM anon;
GRANT SELECT ON public.profiles_public TO authenticated;
CREATE FUNCTION public.start_conversation(p_user_ids uuid[], p_title text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ids uuid[]; result uuid; me uuid:=auth.uid();
BEGIN
 IF me IS NULL THEN RAISE EXCEPTION 'Du måste vara inloggad'; END IF;
 SELECT array_agg(DISTINCT u ORDER BY u) INTO ids FROM unnest(array_append(p_user_ids,me)) u WHERE u IS NOT NULL;
 IF cardinality(ids)<2 THEN RAISE EXCEPTION 'Välj minst en mottagare'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ids) u WHERE NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=u)) THEN RAISE EXCEPTION 'Mottagaren finns inte'; END IF;
 IF cardinality(ids)=2 THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(ids::text,0));
  SELECT c.id INTO result FROM public.conversations c WHERE NOT c.is_group AND (SELECT array_agg(m.user_id ORDER BY m.user_id) FROM public.conversation_members m WHERE m.conversation_id=c.id)=ids LIMIT 1;
  IF result IS NOT NULL THEN RETURN result; END IF;
 END IF;
 INSERT INTO public.conversations(created_by,is_group,title) VALUES(me,cardinality(ids)>2,nullif(trim(p_title),'')) RETURNING id INTO result;
 INSERT INTO public.conversation_members(conversation_id,user_id) SELECT result,unnest(ids);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.start_conversation(uuid[],text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_conversation(uuid[],text) TO authenticated;
CREATE FUNCTION public.notify_user(p_user uuid,p_kind text,p_title text,p_body text,p_link jsonb,p_actor text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ INSERT INTO public.notifications(user_id,kind,title,body,link,actor) SELECT id,p_kind,p_title,p_body,p_link,p_actor FROM public.profiles WHERE id=p_user AND name IS DISTINCT FROM p_actor $$;
CREATE FUNCTION public.notify_montor_team(p_team_name text,p_kind text,p_title text,p_body text,p_link jsonb,p_actor text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT public.notify_user(id,p_kind,p_title,p_body,p_link,p_actor) FROM public.profiles WHERE name=p_team_name $$;
CREATE FUNCTION public.notify_staff(p_seller_name text,p_kind text,p_title text,p_body text,p_link jsonb,p_actor text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT public.notify_user(p.id,p_kind,p_title,p_body,p_link,p_actor) FROM public.profiles p WHERE p.name=p_seller_name OR EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=p.id AND (r.is_admin OR r.role='coordinator')) $$;
REVOKE ALL ON FUNCTION public.notify_user(uuid,text,text,text,jsonb,text), public.notify_montor_team(text,text,text,text,jsonb,text), public.notify_staff(text,text,text,text,jsonb,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.notify_order_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE team_name text; a text:=public.auth_user_name(); l jsonb:=jsonb_build_object('type','a_order','id',NEW.id); label text:=CASE WHEN NEW.order_kind='service' THEN 'Serviceorder' ELSE 'A-order' END;
BEGIN
 SELECT name INTO team_name FROM public.montor_teams WHERE id=NEW.team_id;
 IF NEW.order_sent_at IS NOT NULL AND (TG_OP='INSERT' OR NEW.order_sent_at IS DISTINCT FROM OLD.order_sent_at) THEN PERFORM public.notify_montor_team(team_name,'a_order_sent',label||' #'||NEW.order_number||' skickades till dig',NEW.customer_address,l,a); END IF;
 IF NEW.invoice_sent_at IS NOT NULL AND (TG_OP='INSERT' OR NEW.invoice_sent_at IS DISTINCT FROM OLD.invoice_sent_at) THEN PERFORM public.notify_montor_team(team_name,'a_order_invoiced','Faktura '||coalesce(NEW.invoice_number,'')||' skapad för #'||NEW.order_number,NEW.customer_address,l,a); END IF;
 IF NEW.paid_at IS NOT NULL AND (TG_OP='INSERT' OR NEW.paid_at IS DISTINCT FROM OLD.paid_at) THEN PERFORM public.notify_montor_team(team_name,'a_order_paid','Faktura '||coalesce(NEW.invoice_number,'')||' är betald',NEW.customer_address,l,a); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER notifications_order AFTER INSERT OR UPDATE ON public.a_orders FOR EACH ROW EXECUTE FUNCTION public.notify_order_change();
CREATE FUNCTION public.notify_case_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a text:=public.auth_user_name(); l jsonb:=jsonb_build_object('type','case','id',NEW.id);
BEGIN
 IF NEW.team IS NOT NULL AND (TG_OP='INSERT' OR NEW.team IS DISTINCT FROM OLD.team) THEN PERFORM public.notify_montor_team(NEW.team,'case_assigned','Du är tilldelad montage: '||NEW.address,NULL,l,a); END IF;
 IF NEW.km_team IS NOT NULL AND (TG_OP='INSERT' OR NEW.km_team IS DISTINCT FROM OLD.km_team) THEN PERFORM public.notify_montor_team(NEW.km_team,'km_assigned','Du är tilldelad kontrollmätning: '||NEW.address,NULL,l,a); END IF;
 IF NEW.montage_date IS NOT NULL AND NEW.team IS NOT NULL AND (TG_OP='INSERT' OR NEW.montage_date IS DISTINCT FROM OLD.montage_date) THEN PERFORM public.notify_montor_team(NEW.team,'montage_booked','Montage bokat '||NEW.montage_date||CASE WHEN NEW.montage_time IS NOT NULL THEN ' kl '||to_char(NEW.montage_time,'HH24:MI') ELSE '' END||': '||NEW.address,NULL,l,a); END IF;
 IF (TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status) AND NEW.status IN('montage_klart','km_klar','vantar_godkannande') THEN PERFORM public.notify_staff(NEW.seller,NEW.status,CASE NEW.status WHEN 'montage_klart' THEN 'Montage klart: ' WHEN 'km_klar' THEN 'KM klar: ' ELSE 'Extra timmar begärda: ' END||NEW.address,CASE WHEN NEW.status='vantar_godkannande' THEN NEW.extra_hours_requested||' timmar' ELSE NULL END,l,a); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER notifications_case AFTER INSERT OR UPDATE ON public.cases FOR EACH ROW EXECUTE FUNCTION public.notify_case_change();
CREATE FUNCTION public.notify_deviation_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.cases%ROWTYPE; a text:=coalesce(public.auth_user_name(),NEW.created_by); address_text text;
BEGIN
 SELECT * INTO c FROM public.cases WHERE id=NEW.case_id;
 address_text:=coalesce(c.address,NEW.address,'');
 IF TG_OP='INSERT' THEN PERFORM public.notify_staff(c.seller,'deviation','Problem rapporterat: '||address_text,NEW.type||': '||left(NEW.description,80),jsonb_build_object('type','case','id',NEW.case_id),a); END IF;
 IF NEW.ball='montor' AND nullif(NEW.next_step,'') IS NOT NULL AND (TG_OP='INSERT' OR NEW.next_step IS DISTINCT FROM OLD.next_step OR NEW.ball IS DISTINCT FROM OLD.ball) THEN PERFORM public.notify_montor_team(c.team,'deviation_next_step','Nästa steg på reklamation: '||address_text,NEW.next_step,jsonb_build_object('type','case','id',NEW.case_id),a); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER notifications_deviation AFTER INSERT OR UPDATE ON public.deviations FOR EACH ROW EXECUTE FUNCTION public.notify_deviation_change();
CREATE FUNCTION public.notify_cost_added() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE seller_name text;
BEGIN SELECT seller INTO seller_name FROM public.cases WHERE id=NEW.case_id;
 PERFORM public.notify_staff(seller_name,'cost','Kostnad tillagd av '||NEW.created_by||': '||NEW.description||' – '||NEW.amount||' kr',NULL,jsonb_build_object('type','case','id',NEW.case_id),coalesce(public.auth_user_name(),NEW.created_by)); RETURN NEW;
END $$;
CREATE TRIGGER notifications_cost AFTER INSERT ON public.case_costs FOR EACH ROW EXECUTE FUNCTION public.notify_cost_added();
CREATE FUNCTION public.notify_message_added() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sender_name text; member record;
BEGIN SELECT name INTO sender_name FROM public.profiles WHERE id=NEW.sender_id;
 FOR member IN SELECT user_id FROM public.conversation_members WHERE conversation_id=NEW.conversation_id AND user_id<>NEW.sender_id LOOP
 PERFORM public.notify_user(member.user_id,'message','Nytt meddelande från '||sender_name,left(NEW.body,100),jsonb_build_object('type','chat','id',NEW.conversation_id),sender_name);
 END LOOP; RETURN NEW;
END $$;
CREATE TRIGGER notifications_message AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.notify_message_added();
REVOKE ALL ON FUNCTION public.notify_order_change(),public.notify_case_change(),public.notify_deviation_change(),public.notify_cost_added(),public.notify_message_added() FROM PUBLIC,anon,authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications,public.messages,public.conversation_members;