-- Phase 7: inventory integration

-- approving an invoice with product-linked lines creates stock moves
create or replace function public.invoice_stock_moves() returns trigger
language plpgsql security definer set search_path = public as $$
declare l record; mv_kind text;
begin
  if not (new.status = 'approved' and old.status is distinct from 'approved') then return new; end if;
  if new.kind = 'quote' then return new; end if;
  if not exists(select 1 from public.invoice_lines where invoice_id = new.id and product_id is not null) then
    return new;
  end if;
  if new.warehouse_id is null then
    raise exception 'حدد المخزن للفاتورة قبل الاعتماد (بها أصناف مخزون)';
  end if;
  mv_kind := case new.kind
    when 'sale' then 'out'
    when 'purchase' then 'in'
    when 'sale_return' then 'return_in'
    else 'return_out' end;
  for l in select * from public.invoice_lines where invoice_id = new.id and product_id is not null loop
    insert into public.stock_moves (product_id, warehouse_id, date, kind, qty, unit_cost, ref_type, ref_id, created_by)
      values (l.product_id, new.warehouse_id, new.date, mv_kind, l.qty, l.unit_price * new.fx_rate, 'invoice', new.id, new.created_by);
  end loop;
  return new;
end $$;
drop trigger if exists invoice_stock_moves on public.invoices;
create trigger invoice_stock_moves after update on public.invoices
  for each row execute function public.invoice_stock_moves();

-- stock valuation per warehouse and total
create or replace view public.v_stock_value
with (security_invoker=on) as
select warehouse_id, warehouse_name,
  sum(on_hand) as total_qty,
  sum(on_hand * purchase_cost) as value
from public.v_inventory
group by warehouse_id, warehouse_name;

grant select on public.v_stock_value to authenticated;
