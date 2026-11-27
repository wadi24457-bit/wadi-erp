-- Phase 9: reporting views

-- due_date column for invoices if missing
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='invoices' and column_name='due_date') then
    alter table public.invoices add column due_date date;
  end if;
end $$;

-- monthly profit: revenue (4xxx) - cogs/expenses (5xxx), base currency, approved journals
create or replace view public.v_profit_monthly
with (security_invoker=on) as
select to_char(j.date, 'YYYY-MM') as month,
  coalesce(sum(case when a.code like '4%' then (l.credit - l.debit) * l.fx_rate end), 0) as revenue,
  coalesce(sum(case when a.code like '5%' then (l.debit - l.credit) * l.fx_rate end), 0) as costs,
  coalesce(sum(case when a.code like '4%' then (l.credit - l.debit) * l.fx_rate end), 0)
    - coalesce(sum(case when a.code like '5%' then (l.debit - l.credit) * l.fx_rate end), 0) as profit
from public.journals j
join public.journal_lines l on l.journal_id = j.id
join public.accounts a on a.id = l.account_id
where j.status = 'approved'
group by 1
order by 1 desc;
grant select on public.v_profit_monthly to authenticated;
grant select on public.v_profit_monthly to service_role;

-- daily profit (same basis)
create or replace view public.v_profit_daily
with (security_invoker=on) as
select j.date,
  coalesce(sum(case when a.code like '4%' then (l.credit - l.debit) * l.fx_rate end), 0) as revenue,
  coalesce(sum(case when a.code like '5%' then (l.debit - l.credit) * l.fx_rate end), 0) as costs,
  coalesce(sum(case when a.code like '4%' then (l.credit - l.debit) * l.fx_rate end), 0)
    - coalesce(sum(case when a.code like '5%' then (l.debit - l.credit) * l.fx_rate end), 0) as profit
from public.journals j
join public.journal_lines l on l.journal_id = j.id
join public.accounts a on a.id = l.account_id
where j.status = 'approved'
group by 1
order by 1 desc;
grant select on public.v_profit_daily to authenticated;
grant select on public.v_profit_daily to service_role;

-- monthly cash flow from approved vouchers
create or replace view public.v_cashflow_monthly
with (security_invoker=on) as
select to_char(p.date, 'YYYY-MM') as month,
  coalesce(sum(case when p.kind = 'receipt' then p.amount * p.fx_rate end), 0) as receipts,
  coalesce(sum(case when p.kind = 'payment' then p.amount * p.fx_rate end), 0) as payments,
  coalesce(sum(case when p.kind = 'receipt' then p.amount * p.fx_rate
                    when p.kind = 'payment' then -p.amount * p.fx_rate end), 0) as net
from public.payments p
where p.deleted_at is null and p.status = 'approved'
group by 1
order by 1 desc;
grant select on public.v_cashflow_monthly to authenticated;
grant select on public.v_cashflow_monthly to service_role;

-- monthly collected tax from invoices
create or replace view public.v_taxes_monthly
with (security_invoker=on) as
select to_char(i.date, 'YYYY-MM') as month,
  coalesce(sum(case when i.kind in ('sale','sale_return') then i.tax * i.fx_rate end), 0) as sales_tax,
  coalesce(sum(case when i.kind in ('purchase','purchase_return') then i.tax * i.fx_rate end), 0) as purchase_tax
from public.invoices i
where i.deleted_at is null and i.status not in ('cancelled','new')
group by 1
order by 1 desc;
grant select on public.v_taxes_monthly to authenticated;
grant select on public.v_taxes_monthly to service_role;

-- employee advances outstanding per employee (for dues questions)
create or replace view public.v_employee_dues
with (security_invoker=on) as
select e.id, e.name, e.job_title,
  coalesce(sum(a.remaining), 0) as advances_remaining,
  count(a.id) filter (where a.status = 'disbursed') as open_advances
from public.employees e
left join public.advances a on a.employee_id = e.id and a.deleted_at is null and a.status in ('disbursed','settled')
where e.deleted_at is null
group by e.id, e.name, e.job_title;
grant select on public.v_employee_dues to authenticated;
grant select on public.v_employee_dues to service_role;

-- unpaid invoices aging (for notifications + reports)
create or replace view public.v_unpaid_invoices
with (security_invoker=on) as
select i.id, i.ref_no, i.kind, i.party_type,
  coalesce(c.name, s.name) as party_name,
  i.date, i.due_date,
  (i.total - i.paid) * i.fx_rate as remaining_base, i.currency, i.total, i.paid,
  case when i.due_date is not null then current_date - i.due_date end as days_overdue
from public.invoices i
left join public.customers c on i.party_type = 'customer' and c.id = i.party_id
left join public.suppliers s on i.party_type = 'supplier' and s.id = i.party_id
where i.deleted_at is null and i.status not in ('cancelled','new')
  and i.kind in ('sale','purchase') and (i.total - i.paid) > 0.005;
grant select on public.v_unpaid_invoices to authenticated;
grant select on public.v_unpaid_invoices to service_role;
