alter table public.consultant_payouts drop constraint if exists consultant_payouts_source_check;
alter table public.consultant_payouts add constraint consultant_payouts_source_check check (source in ('system','wizard','imported'));
