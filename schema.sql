-- WADI ERP - Phase 1: full database foundation + user system
begin;
create extension if not exists pgcrypto;

-- ============ USERS / RBAC ============
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  role text not null default 'employee' check (role in ('super_admin','owner','general_manager','accountant','hr_manager','sales_manager','purchasing_manager','warehouse_manager','employee')),
  permissions jsonb not null default '{}',
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.role_permissions (
  role text primary key,
  perms jsonb not null default '{}'
);

-- permission keys: dashboard.view, accounting.view/manage/approve, treasury.manage, expenses.view/manage,
-- hr.view/manage, advances.manage/approve, parties.view/manage, sales.manage, purchases.manage,
-- inventory.view/manage, trade.view/manage, reports.view, users.manage, settings.manage, audit.view
insert into public.role_permissions (role, perms) values
 ('super_admin', '{}'::jsonb),
 ('owner', '{"dashboard.view":true,"accounting.view":true,"accounting.manage":true,"accounting.approve":true,"treasury.manage":true,"expenses.view":true,"expenses.manage":true,"hr.view":true,"hr.manage":true,"advances.manage":true,"advances.approve":true,"parties.view":true,"parties.manage":true,"sales.manage":true,"purchases.manage":true,"inventory.view":true,"inventory.manage":true,"trade.view":true,"trade.manage":true,"reports.view":true,"settings.manage":true,"audit.view":true}'::jsonb),
 ('general_manager', '{"dashboard.view":true,"accounting.view":true,"treasury.manage":true,"expenses.view":true,"expenses.manage":true,"hr.view":true,"advances.approve":true,"parties.view":true,"parties.manage":true,"sales.manage":true,"purchases.manage":true,"inventory.view":true,"trade.view":true,"reports.view":true,"audit.view":true}'::jsonb),
 ('accountant', '{"dashboard.view":true,"accounting.view":true,"accounting.manage":true,"treasury.manage":true,"expenses.view":true,"expenses.manage":true,"parties.view":true,"reports.view":true}'::jsonb),
 ('hr_manager', '{"dashboard.view":true,"hr.view":true,"hr.manage":true,"advances.manage":true,"advances.approve":true,"expenses.view":true}'::jsonb),
 ('sales_manager', '{"dashboard.view":true,"parties.view":true,"sales.manage":true,"inventory.view":true,"reports.view":true}'::jsonb),
 ('purchasing_manager', '{"dashboard.view":true,"parties.view":true,"purchases.manage":true,"inventory.view":true,"trade.view":true,"trade.manage":true,"reports.view":true}'::jsonb),
 ('warehouse_manager', '{"dashboard.view":true,"inventory.view":true,"inventory.manage":true,"parties.view":true}'::jsonb),
 ('employee', '{"dashboard.view":true}'::jsonb)
on conflict (role) do nothing;

create or replace function public.current_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active and deleted_at is null
$$;

create or replace function public.has_perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  with me as (
    select role, permissions from public.profiles
    where id = auth.uid() and is_active and deleted_at is null
  )
  select case
    when (select role from me) = 'super_admin' then true
    when (select (permissions ->> p)::boolean from me) is not null then (select (permissions ->> p)::boolean from me)
    else coalesce((select (rp.perms ->> p)::boolean from public.role_permissions rp join me on rp.role = me.role), false)
  end
$$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and is_active and deleted_at is null)
$$;

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  user_id uuid,
  action text not null,
  table_name text,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

-- generic audit trigger
create or replace function public.audit_trigger_fn() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log(user_id, action, table_name, record_id, new_data)
    values (auth.uid(), 'insert', tg_table_name, coalesce(new.id::text, null), to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.audit_log(user_id, action, table_name, record_id, old_data, new_data)
    values (auth.uid(), 'update', tg_table_name, coalesce(new.id::text, old.id::text), to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into public.audit_log(user_id, action, table_name, record_id, old_data)
    values (auth.uid(), 'delete', tg_table_name, old.id::text, to_jsonb(old));
    return old;
  end if;
end $$;

-- updated_at maintenance
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

-- ============ SETTINGS / ORG ============
create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  company_name text not null default 'WADI',
  base_currency text not null default 'EGP',
  logo_url text,
  address text,
  phone text,
  tax_number text,
  closed_periods jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (1) on conflict do nothing;

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text, phone text,
  is_active boolean not null default true,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches(id),
  name text not null,
  is_active boolean not null default true,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table if not exists public.currencies (
  code text primary key,
  name text not null,
  symbol text
);
insert into public.currencies (code, name, symbol) values
 ('EGP','جنيه مصري','ج.م'),('USD','دولار أمريكي','$'),('EUR','يورو','€'),('SAR','ريال سعودي','ر.س')
on conflict do nothing;

create table if not exists public.fx_rates (
  id uuid primary key default gen_random_uuid(),
  currency text not null references public.currencies(code),
  rate_to_base numeric not null check (rate_to_base > 0),
  at timestamptz not null default now(),
  created_by uuid, created_at timestamptz not null default now()
);

-- ============ ACCOUNTING ============
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  type text not null check (type in ('asset','liability','equity','revenue','expense')),
  parent_id uuid references public.accounts(id),
  is_active boolean not null default true,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table if not exists public.cashboxes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'cash' check (kind in ('cash','bank')),
  account_id uuid references public.accounts(id),
  branch_id uuid references public.branches(id),
  is_active boolean not null default true,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create sequence if not exists public.ref_seq start 1;
create or replace function public.next_ref(prefix text) returns text
language sql volatile as $$ select prefix || '-' || lpad(nextval('public.ref_seq')::text, 6, '0') $$;

create table if not exists public.journals (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique default public.next_ref('JV'),
  date date not null default current_date,
  description text not null default '',
  status text not null default 'draft' check (status in ('draft','approved','voided')),
  source_type text, source_id uuid,
  branch_id uuid references public.branches(id),
  created_by uuid, approved_by uuid, approved_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table if not exists public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.journals(id) on delete cascade,
  account_id uuid not null references public.accounts(id),
  debit numeric not null default 0 check (debit >= 0),
  credit numeric not null default 0 check (credit >= 0),
  currency text not null default 'EGP',
  fx_rate numeric not null default 1 check (fx_rate > 0),
  party_type text, party_id uuid,
  description text,
  check (not (debit > 0 and credit > 0))
);

-- balanced + period lock + immutability of approved journals
create or replace function public.journal_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare s record; d numeric; c numeric;
begin
  if tg_op in ('UPDATE','DELETE') then
    if old.status = 'approved' and (tg_op = 'DELETE' or new.status = 'approved') then
      raise exception 'approved journals cannot be edited or deleted; post a reversal instead';
    end if;
  end if;
  if tg_op in ('INSERT','UPDATE') and new.status = 'approved' and (tg_op = 'INSERT' or old.status <> 'approved') then
    select coalesce(sum(debit*fx_rate),0), coalesce(sum(credit*fx_rate),0) into d, c
      from public.journal_lines where journal_id = new.id;
    if d = 0 or abs(d - c) > 0.005 then
      raise exception 'journal % is not balanced (debit %, credit %)', new.ref_no, d, c;
    end if;
    if exists(select 1 from public.app_settings where closed_periods @> to_jsonb(to_char(new.date,'YYYY-MM'))) then
      raise exception 'period % is closed', to_char(new.date,'YYYY-MM');
    end if;
    new.approved_by = auth.uid(); new.approved_at = now();
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists journal_guard on public.journals;
create trigger journal_guard before insert or update or delete on public.journals
  for each row execute function public.journal_guard();

-- ============ PARTIES ============
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default public.next_ref('CUS'),
  name text not null,
  contact_person text, phone text, email text, address text,
  tax_number text, country text default 'EG',
  notes text, is_active boolean not null default true,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default public.next_ref('SUP'),
  name text not null,
  contact_person text, phone text, email text, address text,
  tax_number text, country text default 'EG',
  notes text, is_active boolean not null default true,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

-- ============ INVENTORY ============
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  barcode text,
  name text not null,
  category text,
  unit text not null default 'قطعة',
  min_stock numeric not null default 0,
  purchase_cost numeric not null default 0,
  sale_price numeric not null default 0,
  is_active boolean not null default true,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table if not exists public.stock_moves (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  warehouse_id uuid not null references public.warehouses(id),
  date date not null default current_date,
  kind text not null check (kind in ('in','out','transfer_out','transfer_in','adjust','waste','return_in','return_out')),
  qty numeric not null check (qty <> 0),
  unit_cost numeric not null default 0,
  ref_type text, ref_id uuid,
  transfer_id uuid,
  notes text,
  created_by uuid, created_at timestamptz not null default now(), deleted_at timestamptz
);
create index if not exists stock_moves_product_idx on public.stock_moves(product_id, warehouse_id);

create or replace view public.v_inventory as
select p.id as product_id, p.sku, p.name, p.unit, p.min_stock, p.sale_price, p.purchase_cost,
       w.id as warehouse_id, w.name as warehouse_name,
       coalesce(sum(case when m.kind in ('in','transfer_in','return_in','adjust') and m.qty > 0 then m.qty
                         when m.kind = 'adjust' then m.qty
                         else -abs(m.qty) end), 0) as on_hand,
       coalesce(sum(case when m.kind in ('in','return_in') then abs(m.qty) * m.unit_cost else 0 end), 0) as in_value
from public.products p
cross join public.warehouses w
left join public.stock_moves m on m.product_id = p.id and m.warehouse_id = w.id and m.deleted_at is null
where p.deleted_at is null and w.deleted_at is null
group by p.id, p.sku, p.name, p.unit, p.min_stock, p.sale_price, p.purchase_cost, w.id, w.name;

-- ============ SALES / PURCHASES / SUPPLY ============
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique default public.next_ref('INV'),
  kind text not null check (kind in ('sale','purchase','sale_return','purchase_return','quote')),
  party_type text not null check (party_type in ('customer','supplier')),
  party_id uuid not null,
  date date not null default current_date,
  status text not null default 'new' check (status in ('new','under_review','approved','in_progress','shipped','delivered','completed','cancelled')),
  currency text not null default 'EGP',
  fx_rate numeric not null default 1 check (fx_rate > 0),
  subtotal numeric not null default 0,
  tax numeric not null default 0,
  discount numeric not null default 0,
  shipping_cost numeric not null default 0,
  total numeric not null default 0,
  paid numeric not null default 0,
  warehouse_id uuid references public.warehouses(id),
  branch_id uuid references public.branches(id),
  journal_id uuid references public.journals(id),
  notes text,
  created_by uuid, approved_by uuid, approved_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create index if not exists invoices_party_idx on public.invoices(party_type, party_id);

create table if not exists public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  product_id uuid references public.products(id),
  description text,
  qty numeric not null check (qty > 0),
  unit_price numeric not null default 0 check (unit_price >= 0),
  discount numeric not null default 0,
  tax numeric not null default 0,
  total numeric generated always as (qty * unit_price - discount + tax) stored
);

create or replace function public.invoice_totals() returns trigger
language plpgsql security definer set search_path = public as $$
declare iid uuid;
begin
  iid = coalesce(new.invoice_id, old.invoice_id);
  update public.invoices i set
    subtotal = coalesce((select sum(qty * unit_price - discount) from public.invoice_lines where invoice_id = iid), 0),
    tax = coalesce((select sum(tax) from public.invoice_lines where invoice_id = iid), 0),
    total = coalesce((select sum(total) from public.invoice_lines where invoice_id = iid), 0) + i.shipping_cost - i.discount,
    updated_at = now()
  where i.id = iid;
  return coalesce(new, old);
end $$;
drop trigger if exists invoice_totals on public.invoice_lines;
create trigger invoice_totals after insert or update or delete on public.invoice_lines
  for each row execute function public.invoice_totals();

create table if not exists public.supply_requests (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique default public.next_ref('SR'),
  title text not null,
  party_type text check (party_type in ('customer','supplier')),
  party_id uuid,
  status text not null default 'new' check (status in ('new','under_review','approved','in_progress','shipped','delivered','completed','cancelled')),
  expected_date date,
  notes text,
  invoice_id uuid references public.invoices(id),
  created_by uuid, approved_by uuid, approved_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

-- ============ TREASURY / PAYMENTS ============
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique default public.next_ref('PAY'),
  kind text not null check (kind in ('receipt','payment')),
  date date not null default current_date,
  party_type text check (party_type in ('customer','supplier','employee','other')),
  party_id uuid,
  amount numeric not null check (amount > 0),
  currency text not null default 'EGP',
  fx_rate numeric not null default 1 check (fx_rate > 0),
  cashbox_id uuid not null references public.cashboxes(id),
  invoice_id uuid references public.invoices(id),
  status text not null default 'approved' check (status in ('draft','approved','voided')),
  journal_id uuid references public.journals(id),
  notes text,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

-- ============ EXPENSES ============
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique default public.next_ref('EXP'),
  date date not null default current_date,
  category text not null,
  amount numeric not null check (amount > 0),
  currency text not null default 'EGP',
  fx_rate numeric not null default 1 check (fx_rate > 0),
  payment_method text not null,
  cashbox_id uuid references public.cashboxes(id),
  branch_id uuid references public.branches(id),
  responsible text,
  notes text,
  attachment_url text,
  journal_id uuid references public.journals(id),
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  month text not null,
  category text not null,
  amount numeric not null check (amount >= 0),
  branch_id uuid references public.branches(id),
  created_by uuid, created_at timestamptz not null default now(),
  unique (month, category, branch_id)
);

-- ============ HR ============
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default public.next_ref('EMP'),
  name text not null,
  phone text, email text,
  job_title text, department text,
  hire_date date,
  base_salary numeric not null default 0,
  branch_id uuid references public.branches(id),
  is_active boolean not null default true,
  notes text,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  date date not null,
  check_in timestamptz, check_out timestamptz,
  status text not null default 'present' check (status in ('present','absent','leave','late')),
  notes text,
  created_by uuid, created_at timestamptz not null default now(),
  unique (employee_id, date)
);

create table if not exists public.leaves (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  kind text not null default 'annual',
  from_date date not null, to_date date not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  notes text,
  created_by uuid, approved_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table if not exists public.advances (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique default public.next_ref('ADV'),
  employee_id uuid not null references public.employees(id),
  amount numeric not null check (amount > 0),
  reason text,
  request_date date not null default current_date,
  status text not null default 'pending' check (status in ('pending','approved','rejected','disbursed','settled')),
  disbursed_amount numeric not null default 0,
  disbursed_at timestamptz,
  repayment_method text default 'salary_deduction',
  installment_amount numeric not null default 0,
  remaining numeric not null default 0,
  cashbox_id uuid references public.cashboxes(id),
  journal_id uuid references public.journals(id),
  created_by uuid, approved_by uuid, approved_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table if not exists public.advance_installments (
  id uuid primary key default gen_random_uuid(),
  advance_id uuid not null references public.advances(id) on delete cascade,
  amount numeric not null check (amount > 0),
  due_date date,
  paid_date date,
  created_at timestamptz not null default now()
);

-- ============ IMPORT / EXPORT ============
create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique default public.next_ref('SHP'),
  kind text not null check (kind in ('import','export')),
  origin_country text, dest_country text,
  foreign_party text,
  party_id uuid,
  container_no text, shipping_company text,
  ship_date date, eta date, arrived_at date,
  incoterm text,
  currency text not null default 'USD',
  fx_rate numeric not null default 1 check (fx_rate > 0),
  customs numeric not null default 0,
  insurance numeric not null default 0,
  port_fees numeric not null default 0,
  freight_cost numeric not null default 0,
  other_costs numeric not null default 0,
  status text not null default 'new' check (status in ('new','in_transit','customs','arrived','cleared','completed','cancelled')),
  notes text,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table if not exists public.shipment_items (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  product_id uuid not null references public.products(id),
  qty numeric not null check (qty > 0),
  unit_cost numeric not null default 0
);

create or replace view public.v_shipment_landed as
select si.id, si.shipment_id, si.product_id, si.qty, si.unit_cost,
  s.currency, s.fx_rate,
  (si.qty * si.unit_cost * s.fx_rate) as goods_value_base,
  case when t.total_goods > 0
       then (si.qty * si.unit_cost / t.total_goods) * (s.customs + s.insurance + s.port_fees + s.freight_cost + s.other_costs) * s.fx_rate
       else 0 end as allocated_costs_base,
  (si.qty * si.unit_cost * s.fx_rate) +
  case when t.total_goods > 0
       then (si.qty * si.unit_cost / t.total_goods) * (s.customs + s.insurance + s.port_fees + s.freight_cost + s.other_costs) * s.fx_rate
       else 0 end as landed_total_base
from public.shipment_items si
join public.shipments s on s.id = si.shipment_id
join (select shipment_id, sum(qty * unit_cost) as total_goods from public.shipment_items group by 1) t
  on t.shipment_id = si.shipment_id;

-- ============ ATTACHMENTS / NOTIFICATIONS ============
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null,
  owner_id uuid not null,
  label text,
  file_url text not null,
  created_by uuid, created_at timestamptz not null default now(), deleted_at timestamptz
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  title text not null,
  body text,
  kind text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============ DEFAULT CHART OF ACCOUNTS ============
insert into public.accounts (code, name, type) values
 ('1000','الأصول','asset'),('1100','الخزائن والبنوك','asset'),('1200','العملاء (مدينون)','asset'),
 ('1300','المخزون','asset'),('1400','سلف الموظفين','asset'),
 ('2000','الخصوم','liability'),('2100','الموردون (دائنون)','liability'),('2200','مصروفات مستحقة','liability'),
 ('3000','حقوق الملكية','equity'),('3100','رأس المال','equity'),
 ('4000','الإيرادات','revenue'),('4100','إيرادات المبيعات','revenue'),
 ('5000','المصروفات','expense'),('5100','تكلفة المشتريات','expense'),('5200','المصروفات التشغيلية','expense'),('5300','الرواتب','expense')
on conflict (code) do nothing;

-- ============ ROW LEVEL SECURITY ============
alter table public.profiles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.audit_log enable row level security;
alter table public.app_settings enable row level security;
alter table public.branches enable row level security;
alter table public.warehouses enable row level security;
alter table public.currencies enable row level security;
alter table public.fx_rates enable row level security;
alter table public.accounts enable row level security;
alter table public.cashboxes enable row level security;
alter table public.journals enable row level security;
alter table public.journal_lines enable row level security;
alter table public.customers enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.stock_moves enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.supply_requests enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.budgets enable row level security;
alter table public.employees enable row level security;
alter table public.attendance enable row level security;
alter table public.leaves enable row level security;
alter table public.advances enable row level security;
alter table public.advance_installments enable row level security;
alter table public.shipments enable row level security;
alter table public.shipment_items enable row level security;
alter table public.attachments enable row level security;
alter table public.notifications enable row level security;

-- profiles: everyone reads own; admins read all; only users.manage writes (creation via edge function)
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_perm('users.manage'));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (public.has_perm('users.manage') or (id = auth.uid()))
  with check (public.has_perm('users.manage') or (id = auth.uid() and role = (select role from public.profiles where id = auth.uid())));

drop policy if exists role_permissions_read on public.role_permissions;
create policy role_permissions_read on public.role_permissions for select to authenticated using (public.is_active_user());

drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select to authenticated using (public.has_perm('audit.view'));

-- settings: all active users read, settings.manage writes
drop policy if exists settings_read on public.app_settings;
create policy settings_read on public.app_settings for select to authenticated using (public.is_active_user());
drop policy if exists settings_write on public.app_settings;
create policy settings_write on public.app_settings for all to authenticated
  using (public.has_perm('settings.manage')) with check (public.has_perm('settings.manage'));

-- generic module policies
do $$
declare t text; perm text;
begin
  foreach t in array array['branches','warehouses'] loop
    execute format('drop policy if exists %I_read on public.%I; create policy %I_read on public.%I for select to authenticated using (public.is_active_user());', t, t, t, t);
    execute format('drop policy if exists %I_write on public.%I; create policy %I_write on public.%I for all to authenticated using (public.has_perm(''settings.manage'')) with check (public.has_perm(''settings.manage''));', t, t, t, t);
  end loop;
  foreach t in array array['currencies','fx_rates'] loop
    execute format('drop policy if exists %I_read on public.%I; create policy %I_read on public.%I for select to authenticated using (public.is_active_user());', t, t, t, t);
    execute format('drop policy if exists %I_write on public.%I; create policy %I_write on public.%I for all to authenticated using (public.has_perm(''settings.manage'')) with check (public.has_perm(''settings.manage''));', t, t, t, t);
  end loop;
  foreach t in array array['accounts','journals','journal_lines'] loop
    execute format('drop policy if exists %I_read on public.%I; create policy %I_read on public.%I for select to authenticated using (public.has_perm(''accounting.view''));', t, t, t, t);
    execute format('drop policy if exists %I_write on public.%I; create policy %I_write on public.%I for all to authenticated using (public.has_perm(''accounting.manage'')) with check (public.has_perm(''accounting.manage''));', t, t, t, t);
  end loop;
  execute 'drop policy if exists cashboxes_read on public.cashboxes; create policy cashboxes_read on public.cashboxes for select to authenticated using (public.has_perm(''accounting.view'') or public.has_perm(''expenses.view''));';
  execute 'drop policy if exists cashboxes_write on public.cashboxes; create policy cashboxes_write on public.cashboxes for all to authenticated using (public.has_perm(''treasury.manage'')) with check (public.has_perm(''treasury.manage''));';
  foreach t in array array['customers','suppliers'] loop
    execute format('drop policy if exists %I_read on public.%I; create policy %I_read on public.%I for select to authenticated using (public.has_perm(''parties.view''));', t, t, t, t);
    execute format('drop policy if exists %I_write on public.%I; create policy %I_write on public.%I for all to authenticated using (public.has_perm(''parties.manage'')) with check (public.has_perm(''parties.manage''));', t, t, t, t);
  end loop;
  foreach t in array array['products','stock_moves'] loop
    execute format('drop policy if exists %I_read on public.%I; create policy %I_read on public.%I for select to authenticated using (public.has_perm(''inventory.view''));', t, t, t, t);
    execute format('drop policy if exists %I_write on public.%I; create policy %I_write on public.%I for all to authenticated using (public.has_perm(''inventory.manage'')) with check (public.has_perm(''inventory.manage''));', t, t, t, t);
  end loop;
  foreach t in array array['invoices','invoice_lines','supply_requests'] loop
    execute format('drop policy if exists %I_read on public.%I; create policy %I_read on public.%I for select to authenticated using (public.has_perm(''parties.view'') or public.has_perm(''inventory.view''));', t, t, t, t);
    execute format('drop policy if exists %I_write on public.%I; create policy %I_write on public.%I for all to authenticated using (public.has_perm(''sales.manage'') or public.has_perm(''purchases.manage'')) with check (public.has_perm(''sales.manage'') or public.has_perm(''purchases.manage''));', t, t, t, t);
  end loop;
  execute 'drop policy if exists payments_read on public.payments; create policy payments_read on public.payments for select to authenticated using (public.has_perm(''accounting.view''));';
  execute 'drop policy if exists payments_write on public.payments; create policy payments_write on public.payments for all to authenticated using (public.has_perm(''treasury.manage'')) with check (public.has_perm(''treasury.manage''));';
  foreach t in array array['expenses','budgets'] loop
    execute format('drop policy if exists %I_read on public.%I; create policy %I_read on public.%I for select to authenticated using (public.has_perm(''expenses.view''));', t, t, t, t);
    execute format('drop policy if exists %I_write on public.%I; create policy %I_write on public.%I for all to authenticated using (public.has_perm(''expenses.manage'')) with check (public.has_perm(''expenses.manage''));', t, t, t, t);
  end loop;
  foreach t in array array['employees','attendance','leaves','advances','advance_installments'] loop
    execute format('drop policy if exists %I_read on public.%I; create policy %I_read on public.%I for select to authenticated using (public.has_perm(''hr.view''));', t, t, t, t);
    execute format('drop policy if exists %I_write on public.%I; create policy %I_write on public.%I for all to authenticated using (public.has_perm(''hr.manage'') or public.has_perm(''advances.manage'')) with check (public.has_perm(''hr.manage'') or public.has_perm(''advances.manage''));', t, t, t, t);
  end loop;
  foreach t in array array['shipments','shipment_items'] loop
    execute format('drop policy if exists %I_read on public.%I; create policy %I_read on public.%I for select to authenticated using (public.has_perm(''trade.view''));', t, t, t, t);
    execute format('drop policy if exists %I_write on public.%I; create policy %I_write on public.%I for all to authenticated using (public.has_perm(''trade.manage'')) with check (public.has_perm(''trade.manage''));', t, t, t, t);
  end loop;
  execute 'drop policy if exists attachments_read on public.attachments; create policy attachments_read on public.attachments for select to authenticated using (public.is_active_user());';
  execute 'drop policy if exists attachments_write on public.attachments; create policy attachments_write on public.attachments for all to authenticated using (public.is_active_user()) with check (public.is_active_user());';
  execute 'drop policy if exists notifications_read on public.notifications; create policy notifications_read on public.notifications for select to authenticated using (user_id = auth.uid() or user_id is null);';
  execute 'drop policy if exists notifications_update on public.notifications; create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());';
end $$;

-- audit triggers on key tables
do $$
declare t text;
begin
  foreach t in array array['profiles','journals','invoices','payments','expenses','advances','shipments','customers','suppliers','employees','products']
  loop
    execute format('drop trigger if exists audit_%I on public.%I; create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.audit_trigger_fn();', t, t, t, t);
  end loop;
  foreach t in array array['profiles','branches','warehouses','accounts','cashboxes','journals','customers','suppliers','products','invoices','supply_requests','payments','expenses','employees','leaves','advances','shipments','app_settings']
  loop
    execute format('drop trigger if exists touch_%I on public.%I; create trigger touch_%I before update on public.%I for each row execute function public.touch_updated_at();', t, t, t, t);
  end loop;
end $$;

-- views over RLS tables need invoker security
alter view public.v_inventory set (security_invoker = true);
alter view public.v_shipment_landed set (security_invoker = true);

commit;
