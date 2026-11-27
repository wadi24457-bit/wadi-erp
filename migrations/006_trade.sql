-- Phase 6: sales / purchases / supply

-- 1) approving an invoice posts its journal
create or replace function public.invoice_approval_post() returns trigger
language plpgsql security definer set search_path = public as $$
declare j uuid; dr uuid; cr uuid; amt numeric;
begin
  if not (new.status = 'approved' and old.status is distinct from 'approved') then return new; end if;
  if new.kind = 'quote' or new.total <= 0 then return new; end if;
  amt := new.total * new.fx_rate;
  if new.kind = 'sale' then
    dr := (select id from public.accounts where code='1200');
    cr := (select id from public.accounts where code='4100');
  elsif new.kind = 'purchase' then
    dr := (select id from public.accounts where code='5100');
    cr := (select id from public.accounts where code='2100');
  elsif new.kind = 'sale_return' then
    dr := (select id from public.accounts where code='4100');
    cr := (select id from public.accounts where code='1200');
  else
    dr := (select id from public.accounts where code='2100');
    cr := (select id from public.accounts where code='5100');
  end if;
  insert into public.journals (date, description, status, source_type, source_id, created_by)
    values (new.date, (case new.kind when 'sale' then 'فاتورة بيع ' when 'purchase' then 'فاتورة شراء '
                       when 'sale_return' then 'مرتجع بيع ' else 'مرتجع شراء ' end) || new.ref_no,
            'draft', 'invoice', new.id, new.created_by)
    returning id into j;
  insert into public.journal_lines (journal_id, account_id, debit, credit, currency, fx_rate, party_type, party_id)
    values (j, dr, new.total, 0, new.currency, new.fx_rate, new.party_type, new.party_id),
           (j, cr, 0, new.total, new.currency, new.fx_rate, new.party_type, new.party_id);
  update public.journals set status='approved' where id = j;
  new.journal_id := j;
  new.approved_by := auth.uid(); new.approved_at := now();
  return new;
end $$;
drop trigger if exists invoice_approval_post on public.invoices;
create trigger invoice_approval_post before update on public.invoices
  for each row execute function public.invoice_approval_post();

-- 2) payments linked to an invoice keep invoices.paid in sync
create or replace function public.payment_invoice_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare iid uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  if iid is null then return coalesce(new, old); end if;
  update public.invoices set paid = coalesce((
    select sum(amount * fx_rate) from public.payments
    where invoice_id = iid and deleted_at is null and status = 'approved'), 0) / greatest(fx_rate, 0.000001)
  where id = iid;
  return coalesce(new, old);
end $$;
drop trigger if exists payment_invoice_sync on public.payments;
create trigger payment_invoice_sync after insert or update or delete on public.payments
  for each row execute function public.payment_invoice_sync();

-- 3) sales margin view (cost from linked products; free-text lines cost 0)
create or replace view public.v_sales_margin
with (security_invoker=on) as
select i.id as invoice_id, i.ref_no, i.date, i.status,
  i.total * i.fx_rate as revenue,
  coalesce(sum(l.qty * coalesce(p.purchase_cost, 0)), 0) * i.fx_rate as cost,
  (i.total - coalesce(sum(l.qty * coalesce(p.purchase_cost, 0)), 0)) * i.fx_rate as margin
from public.invoices i
left join public.invoice_lines l on l.invoice_id = i.id
left join public.products p on p.id = l.product_id
where i.kind = 'sale' and i.deleted_at is null and i.status <> 'cancelled'
group by i.id, i.ref_no, i.date, i.status, i.total, i.fx_rate;

grant select on public.v_sales_margin to authenticated;
