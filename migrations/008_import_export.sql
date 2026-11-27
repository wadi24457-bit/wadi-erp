-- Phase 8: import/export

-- 1) shipment receipt columns + supplier link
alter table public.shipments
  add column if not exists supplier_id uuid references public.suppliers(id),
  add column if not exists warehouse_id uuid references public.warehouses(id),
  add column if not exists received_at timestamptz,
  add column if not exists journal_id uuid references public.journals(id);

-- 2) historical fx: every rate used on a shipment is kept in fx_rates
create or replace function public.shipment_fx_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' or new.fx_rate is distinct from old.fx_rate or new.currency is distinct from old.currency)
     and new.currency <> 'EGP' and new.fx_rate <> 1 then
    insert into public.fx_rates (currency, rate_to_base, at, created_by)
    values (new.currency, new.fx_rate, coalesce(new.ship_date::timestamptz, now()), auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists shipment_fx_history on public.shipments;
create trigger shipment_fx_history after insert or update on public.shipments
  for each row execute function public.shipment_fx_history();

-- 3) real cashbox availability: approved payments - expenses - disbursed advances
create or replace function public.cashbox_available(p_cashbox uuid) returns numeric
language sql security definer set search_path = public stable as $$
  select coalesce((select sum(case when p.kind='receipt' then p.amount*p.fx_rate else -p.amount*p.fx_rate end)
                   from public.payments p
                   where p.cashbox_id = p_cashbox and p.deleted_at is null and p.status='approved'), 0)
       - coalesce((select sum(e.amount*e.fx_rate) from public.expenses e
                   where e.cashbox_id = p_cashbox and e.deleted_at is null), 0)
       - coalesce((select sum(a.disbursed_amount) from public.advances a
                   where a.cashbox_id = p_cashbox and a.deleted_at is null and a.status in ('disbursed','settled')), 0);
$$;

-- fix the dashboard cashbox view to match real availability
create or replace view public.v_cashbox_balances
with (security_invoker=on) as
select c.id, c.name, c.kind, public.cashbox_available(c.id) as balance
from public.cashboxes c
where c.deleted_at is null and c.is_active;
grant select on public.v_cashbox_balances to authenticated;
grant select on public.v_cashbox_balances to service_role;

-- 4) receive an import shipment into a warehouse at landed cost, posting the journal
create or replace function public.receive_shipment(p_shipment uuid, p_warehouse uuid, p_cashbox uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s record; l record; cb record;
  goods numeric; fees numeric; landed numeric; cnt int;
  j uuid; inv_acct uuid; sup_acct uuid; fee_acct uuid; avail numeric;
begin
  if not public.has_perm('trade.manage') then
    raise exception 'لا تملك صلاحية إدارة الاستيراد والتصدير';
  end if;
  select * into s from public.shipments where id = p_shipment and deleted_at is null;
  if s.id is null then raise exception 'الشحنة غير موجودة'; end if;
  if s.kind <> 'import' then raise exception 'الاستلام للمخزن يخص شحنات الاستيراد فقط'; end if;
  if s.received_at is not null then raise exception 'تم استلام هذه الشحنة من قبل'; end if;
  if s.status not in ('in_transit','customs','arrived','cleared') then
    raise exception 'لا يمكن استلام شحنة بحالة "%"', s.status;
  end if;
  if not exists(select 1 from public.warehouses where id = p_warehouse and deleted_at is null) then
    raise exception 'المخزن غير موجود';
  end if;
  select count(*), coalesce(sum(goods_value_base),0), coalesce(sum(allocated_costs_base),0), coalesce(sum(landed_total_base),0)
    into cnt, goods, fees, landed
    from public.v_shipment_landed where shipment_id = s.id;
  if cnt = 0 then raise exception 'أضف أصناف الشحنة قبل الاستلام'; end if;

  fee_acct := (select id from public.accounts where code = '2200');
  if fees > 0 and p_cashbox is not null then
    select * into cb from public.cashboxes where id = p_cashbox and deleted_at is null;
    if cb.id is null then raise exception 'الخزينة غير موجودة'; end if;
    if not public.has_perm('treasury.overdraw') then
      avail := public.cashbox_available(p_cashbox);
      if avail < fees then
        raise exception 'رصيد الخزينة غير كافٍ لسداد مصاريف الشحنة (المتاح %)', avail;
      end if;
    end if;
    fee_acct := cb.account_id;
  end if;

  -- stock in at landed unit cost; product purchase cost updated to latest landed cost
  for l in select v.*, (v.landed_total_base / v.qty) as landed_unit
           from public.v_shipment_landed v where v.shipment_id = s.id loop
    insert into public.stock_moves (product_id, warehouse_id, date, kind, qty, unit_cost, ref_type, ref_id, notes, created_by)
      values (l.product_id, p_warehouse, coalesce(s.arrived_at::date, current_date), 'in', l.qty, l.landed_unit, 'shipment', s.id, 'استلام شحنة ' || s.ref_no, auth.uid());
    update public.products set purchase_cost = l.landed_unit where id = l.product_id;
  end loop;

  inv_acct := (select id from public.accounts where code = '1300');
  sup_acct := (select id from public.accounts where code = '2100');
  insert into public.journals (date, description, status, source_type, source_id, created_by)
    values (coalesce(s.arrived_at::date, current_date), 'استلام شحنة استيراد ' || s.ref_no, 'draft', 'shipment', s.id, auth.uid())
    returning id into j;
  insert into public.journal_lines (journal_id, account_id, debit, credit, currency, fx_rate, party_type, party_id, description)
    values (j, inv_acct, landed / greatest(s.fx_rate,0.000001), 0, s.currency, s.fx_rate, null, null, 'تكلفة الشحنة بالكامل (landed)');
  insert into public.journal_lines (journal_id, account_id, debit, credit, currency, fx_rate, party_type, party_id, description)
    values (j, sup_acct, 0, goods / greatest(s.fx_rate,0.000001), s.currency, s.fx_rate,
            case when s.supplier_id is not null then 'supplier' end, s.supplier_id, 'قيمة البضاعة');
  if fees > 0 then
    insert into public.journal_lines (journal_id, account_id, debit, credit, currency, fx_rate, description)
      values (j, fee_acct, 0, fees / greatest(s.fx_rate,0.000001), s.currency, s.fx_rate,
              'جمارك وتأمين وموانئ وشحن ومصاريف أخرى' || case when p_cashbox is null then ' (مستحقة)' else '' end);
  end if;
  update public.journals set status = 'approved' where id = j;

  update public.shipments
    set status = 'completed', received_at = now(), warehouse_id = p_warehouse, journal_id = j
    where id = s.id;
  return j;
end $$;
grant execute on function public.receive_shipment(uuid, uuid, uuid) to authenticated;

-- 5) list/summary + delayed shipments
create or replace view public.v_shipment_summary
with (security_invoker=on) as
select s.id, s.ref_no, s.kind, s.status, s.origin_country, s.dest_country,
  s.foreign_party, s.supplier_id, s.container_no, s.shipping_company,
  s.ship_date, s.eta, s.arrived_at, s.incoterm, s.currency, s.fx_rate,
  s.customs, s.insurance, s.port_fees, s.freight_cost, s.other_costs,
  s.received_at, s.journal_id, s.notes, s.created_at,
  coalesce(t.items, 0) as items_count,
  coalesce(t.goods_value, 0) as goods_value,
  (s.customs + s.insurance + s.port_fees + s.freight_cost + s.other_costs) as fees_total,
  (coalesce(t.goods_value, 0) + s.customs + s.insurance + s.port_fees + s.freight_cost + s.other_costs) as grand_total,
  (coalesce(t.goods_value, 0) + s.customs + s.insurance + s.port_fees + s.freight_cost + s.other_costs) * s.fx_rate as grand_total_base,
  (s.eta is not null and s.eta < current_date and s.status in ('new','in_transit','customs')) as is_delayed
from public.shipments s
left join (select shipment_id, count(*) as items, sum(qty * unit_cost) as goods_value
           from public.shipment_items group by 1) t on t.shipment_id = s.id
where s.deleted_at is null;
grant select on public.v_shipment_summary to authenticated;
grant select on public.v_shipment_summary to service_role;

create or replace view public.v_shipments_delayed
with (security_invoker=on) as
select * from public.v_shipment_summary where is_delayed;
grant select on public.v_shipments_delayed to authenticated;
grant select on public.v_shipments_delayed to service_role;

-- landed-cost view needs invoker security + grants (created in schema.sql without them)
create or replace view public.v_shipment_landed
with (security_invoker=on) as
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
  on t.shipment_id = si.shipment_id
where s.deleted_at is null;
grant select on public.v_shipment_landed to authenticated;
grant select on public.v_shipment_landed to service_role;
