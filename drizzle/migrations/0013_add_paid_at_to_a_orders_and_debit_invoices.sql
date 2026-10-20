alter table public.a_orders
  add column if not exists paid_at date,
  add column if not exists paid_by text;
alter table public.montor_debit_invoices
  add column if not exists paid_at date;