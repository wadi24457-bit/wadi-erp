-- Phase 2: dashboard KPI views (security_invoker so base-table RLS/permissions apply per user)
create or replace view public.v_dash_today
with (security_invoker=on) as
select
  coalesce(sum(case when i.kind='sale'     then i.total * i.fx_rate end), 0) as sales_today,
  coalesce(sum(case when i.kind='purchase' then i.total * i.fx_rate end), 0) as purchases_today
from public.invoices i
where i.date = current_date and i.deleted_at is null and i.status <> 'cancelled';

create or replace view public.v_dash_cash_today
with (security_invoker=on) as
select
  coalesce(sum(case when p.kind='receipt' then p.amount * p.fx_rate end), 0) as receipts_today,
  coalesce(sum(case when p.kind='payment' then p.amount * p.fx_rate end), 0) as payments_today
from public.payments p
where p.date = current_date and p.deleted_at is null and p.status = 'approved';

create or replace view public.v_cashbox_balances
with (security_invoker=on) as
select c.id, c.name, c.kind,
  coalesce(sum(case when p.kind='receipt' then p.amount * p.fx_rate
                    when p.kind='payment' then -p.amount * p.fx_rate end), 0) as balance
from public.cashboxes c
left join public.payments p on p.cashbox_id = c.id and p.deleted_at is null and p.status = 'approved'
where c.deleted_at is null and c.is_active
group by c.id, c.name, c.kind;

create or replace view public.v_party_balances
with (security_invoker=on) as
select i.party_type,
  coalesce(sum((i.total - i.paid) * i.fx_rate), 0) as open_balance
from public.invoices i
where i.deleted_at is null and i.status not in ('cancelled','new') and i.kind in ('sale','purchase')
group by i.party_type;

create or replace view public.v_low_stock
with (security_invoker=on) as
select product_id, sku, name, unit, warehouse_name, on_hand, min_stock
from public.v_inventory
where min_stock > 0 and on_hand <= min_stock;

create or replace view public.v_dash_inventory_value
with (security_invoker=on) as
select coalesce(sum(on_hand * purchase_cost), 0) as stock_value,
       coalesce(sum(on_hand), 0) as total_units
from public.v_inventory;

grant select on public.v_dash_today to authenticated;
grant select on public.v_dash_cash_today to authenticated;
grant select on public.v_cashbox_balances to authenticated;
grant select on public.v_party_balances to authenticated;
grant select on public.v_low_stock to authenticated;
grant select on public.v_dash_inventory_value to authenticated;
