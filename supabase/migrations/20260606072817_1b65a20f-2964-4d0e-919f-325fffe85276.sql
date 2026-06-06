
-- Helper functions
create or replace function public.auth_is_admin() returns boolean
  language sql security definer stable set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.auth_user_name() returns text
  language sql security definer stable set search_path = public as $$
  select (select name from public.profiles where id = auth.uid())
$$;

-- Generic app tables
do $$
declare
  t text;
  pol record;
begin
  foreach t in array array['cases','case_events','visits','case_costs','deviations','sheet_metal_orders','insight_history']
  loop
    execute format('alter table public.%I enable row level security', t);
    for pol in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;
    execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)', t||'_auth_all', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- user_calendar_tokens — owner only
alter table public.user_calendar_tokens enable row level security;
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='user_calendar_tokens' loop
    execute format('drop policy if exists %I on public.user_calendar_tokens', pol.policyname);
  end loop;
end $$;
revoke all on public.user_calendar_tokens from anon;
grant select, insert, update, delete on public.user_calendar_tokens to authenticated;
grant all on public.user_calendar_tokens to service_role;
create policy "cal_own_select" on public.user_calendar_tokens
  for select to authenticated using (user_name = public.auth_user_name());
create policy "cal_own_write" on public.user_calendar_tokens
  for all to authenticated
  using (user_name = public.auth_user_name())
  with check (user_name = public.auth_user_name());

-- activity_log — auth insert, admin read
alter table public.activity_log enable row level security;
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='activity_log' loop
    execute format('drop policy if exists %I on public.activity_log', pol.policyname);
  end loop;
end $$;
revoke select, insert on public.activity_log from anon;
grant insert on public.activity_log to authenticated;
grant select on public.activity_log to authenticated;
grant all on public.activity_log to service_role;
create policy "log_insert" on public.activity_log
  for insert to authenticated with check (true);
create policy "log_admin_select" on public.activity_log
  for select to authenticated using (public.auth_is_admin());
