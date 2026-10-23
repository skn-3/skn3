update public.case_events set event_type = 'economy' where event_type = 'update' and (description ilike '%Ordervärde%' or description ilike '%TB ändrat%' or description ilike '%Extra timmar sålda%');

create view public.cases_montor with (security_invoker = true) as
select
  id, created_at, address, customer_name, customer_phone, customer_email,
  seller, team, status, offer_number, extra_hours_requested, extra_hours_approved,
  km_date, montage_date, delivery_date, notes, updated_at, visit_id, imported,
  media_consent, carry_help_needed, city, scheduled_delivery, km_time, montage_time,
  delivery_time, delivery_week, delivery_year, km_team, units, order_number,
  status_changed_at, public_token, montor_notes, is_gotland, klimat_status
from public.cases;

grant select on public.cases_montor to authenticated;
grant select on public.cases_montor to service_role;