create table public.consultants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company_name text not null,
  org_nr text, vat_nr text,
  email text,
  address text,
  bank_name text, bank_account text,
  payer_name text not null,
  payer_org_nr text, payer_vat_nr text, payer_address text, payer_email text,
  next_invoice_number int not null default 1,
  commission_tiers jsonb not null default '[{"upTo":100000,"pct":30},{"upTo":150000,"pct":35},{"upTo":200000,"pct":40},{"upTo":250000,"pct":45},{"upTo":null,"pct":50}]',
  standard_deductions jsonb not null default '[{"label":"Bil + försäkring","amount":3000,"defaultOn":true}]',
  vat_rate numeric not null default 25,
  drive_folder_id text,
  drive_payer_root_id text,
  payer_fiscal_start_month int not null default 9,
  log_sheet_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.consultant_payouts (
  id uuid primary key default gen_random_uuid(),
  consultant_id uuid not null references public.consultants(id),
  kind text not null default 'payout' check (kind in ('payout','advance')),
  payout_month date,
  period_start date, period_end date,
  drive_month_folder_id text, drive_month_folder_name text,
  provision_file_id text, provision_file_name text, provision_payout_date date,
  tb_rows jsonb not null default '[]', tb_corrections jsonb not null default '[]',
  tb_sum_rows numeric, tb_sum_corrections numeric, tb_amount numeric,
  tb_needs_review boolean not null default false, tb_note text,
  tier_pct numeric, commission_gross numeric,
  deductions_total numeric not null default 0,
  loan_change numeric not null default 0,
  net_amount numeric, vat_rate numeric not null default 25, vat_amount numeric, total_incl_vat numeric,
  status text not null default 'draft' check (status in ('draft','invoiced','sent','paid')),
  invoice_number int, invoice_date date, invoice_pdf_path text, spec_pdf_path text,
  invoice_drive_file_id text, invoice_drive_link text,
  sent_at timestamptz, sent_to jsonb, paid_at date, paid_by text,
  notes text, source text not null default 'system' check (source in ('system','imported')),
  created_by text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index consultant_payouts_consultant_month on public.consultant_payouts (consultant_id, payout_month);
create unique index consultant_payouts_invoice_no on public.consultant_payouts (consultant_id, invoice_number) where invoice_number is not null;
create table public.consultant_payout_lines (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references public.consultant_payouts(id) on delete cascade,
  consultant_id uuid not null references public.consultants(id),
  kind text not null check (kind in ('standard','receipt','manual')),
  label text not null,
  amount numeric not null,
  doc_type text,
  issuer text, doc_date date, reg_nr text, doc_number text, doc_number_norm text,
  original_amount numeric, fee_amount numeric, is_reminder boolean, is_owner_cost_candidate boolean not null default false,
  drive_file_id text, drive_file_name text, drive_web_link text, drive_modified_time timestamptz,
  included boolean not null default true,
  duplicate_of uuid references public.consultant_payout_lines(id),
  ai_raw jsonb, sort int not null default 0,
  created_at timestamptz not null default now()
);
create index consultant_payout_lines_doc_number on public.consultant_payout_lines (consultant_id, doc_number_norm);
create index consultant_payout_lines_drive_file on public.consultant_payout_lines (consultant_id, drive_file_id);
create table public.consultant_loans (
  id uuid primary key default gen_random_uuid(),
  consultant_id uuid not null references public.consultants(id),
  date date not null,
  amount numeric not null,
  note text, payout_id uuid references public.consultant_payouts(id), invoice_number int,
  created_by text, created_at timestamptz not null default now()
);

create or replace function public.consultant_next_invoice_number(p_consultant_id uuid)
returns int
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_no int;
begin
  update public.consultants
     set next_invoice_number = greatest(1, coalesce(next_invoice_number, 1)) + 1
   where id = p_consultant_id
  returning greatest(1, coalesce(next_invoice_number, 1)) - 1 into v_no;
  if v_no is null then raise exception 'Konsult hittades inte'; end if;
  return v_no;
end
$function$;

grant select, insert, update, delete on public.consultants to authenticated;
grant select, insert, update, delete on public.consultant_payouts to authenticated;
grant select, insert, update, delete on public.consultant_payout_lines to authenticated;
grant select, insert, update, delete on public.consultant_loans to authenticated;
grant all on public.consultants to service_role;
grant all on public.consultant_payouts to service_role;
grant all on public.consultant_payout_lines to service_role;
grant all on public.consultant_loans to service_role;

alter table public.consultants enable row level security;
alter table public.consultant_payouts enable row level security;
alter table public.consultant_payout_lines enable row level security;
alter table public.consultant_loans enable row level security;

create policy consultants_admin_select on public.consultants for select to authenticated using (public.auth_is_admin());
create policy consultants_admin_insert on public.consultants for insert to authenticated with check (public.auth_is_admin());
create policy consultants_admin_update on public.consultants for update to authenticated using (public.auth_is_admin()) with check (public.auth_is_admin());
create policy consultants_admin_delete on public.consultants for delete to authenticated using (public.auth_is_admin());

create policy consultant_payouts_admin_select on public.consultant_payouts for select to authenticated using (public.auth_is_admin());
create policy consultant_payouts_admin_insert on public.consultant_payouts for insert to authenticated with check (public.auth_is_admin());
create policy consultant_payouts_admin_update on public.consultant_payouts for update to authenticated using (public.auth_is_admin()) with check (public.auth_is_admin());
create policy consultant_payouts_admin_delete on public.consultant_payouts for delete to authenticated using (public.auth_is_admin());

create policy consultant_payout_lines_admin_select on public.consultant_payout_lines for select to authenticated using (public.auth_is_admin());
create policy consultant_payout_lines_admin_insert on public.consultant_payout_lines for insert to authenticated with check (public.auth_is_admin());
create policy consultant_payout_lines_admin_update on public.consultant_payout_lines for update to authenticated using (public.auth_is_admin()) with check (public.auth_is_admin());
create policy consultant_payout_lines_admin_delete on public.consultant_payout_lines for delete to authenticated using (public.auth_is_admin());

create policy consultant_loans_admin_select on public.consultant_loans for select to authenticated using (public.auth_is_admin());
create policy consultant_loans_admin_insert on public.consultant_loans for insert to authenticated with check (public.auth_is_admin());
create policy consultant_loans_admin_update on public.consultant_loans for update to authenticated using (public.auth_is_admin()) with check (public.auth_is_admin());
create policy consultant_loans_admin_delete on public.consultant_loans for delete to authenticated using (public.auth_is_admin());

create trigger trg_consultants_updated_at before update on public.consultants for each row execute function update_updated_at_column();
create trigger trg_consultant_payouts_updated_at before update on public.consultant_payouts for each row execute function update_updated_at_column();

insert into public.consultants (name, company_name, org_nr, vat_nr, email, bank_name, bank_account, payer_name, payer_org_nr, payer_vat_nr, payer_address, payer_email, next_invoice_number, drive_folder_id, drive_payer_root_id, payer_fiscal_start_month)
values ('Gabriel Hanna','VPLG AB','559492-8805','SE559492880501','gabriel.hanna@mockfjards.se','Marginalen Bank','92356100598','Daniel Malke AB','559173-5898','SE559173589801','Morsstigen 3, 141 71 Segeltorp','daniel@smartklimat.org',42,'1CKXn2lHUAp3pHyCiYljrXRkE3-YrARTU','106vxmoo0ExZlikLTNdK1hiaLr2qIypN9',9);