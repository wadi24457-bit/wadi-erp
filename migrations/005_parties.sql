-- Phase 5: customers & suppliers

-- opening balance support
alter table public.customers add column if not exists opening_balance numeric not null default 0;
alter table public.suppliers add column if not exists opening_balance numeric not null default 0;

-- opening balance journal: customer Dr 1200 / Cr 3100; supplier Dr 3100 / Cr 2100
create or replace function public.party_opening_balance() returns trigger
language plpgsql security definer set search_path = public as $$
declare j uuid; cust boolean := tg_table_name = 'customers';
begin
  if new.opening_balance is null or new.opening_balance <= 0 then return new; end if;
  insert into public.journals (date, description, status, source_type, source_id, created_by)
    values (current_date, 'رصيد افتتاحي ' || (case when cust then 'عميل ' else 'مورد ' end) || new.name || ' ' || new.code,
            'draft', tg_table_name, new.id, new.created_by)
    returning id into j;
  if cust then
    insert into public.journal_lines (journal_id, account_id, debit, credit, party_type, party_id, description)
      values (j, (select id from public.accounts where code='1200'), new.opening_balance, 0, 'customer', new.id, 'رصيد افتتاحي'),
             (j, (select id from public.accounts where code='3100'), 0, new.opening_balance, 'customer', new.id, 'رصيد افتتاحي');
  else
    insert into public.journal_lines (journal_id, account_id, debit, credit, party_type, party_id, description)
      values (j, (select id from public.accounts where code='3100'), new.opening_balance, 0, 'supplier', new.id, 'رصيد افتتاحي'),
             (j, (select id from public.accounts where code='2100'), 0, new.opening_balance, 'supplier', new.id, 'رصيد افتتاحي');
  end if;
  update public.journals set status='approved' where id = j;
  return new;
end $$;
drop trigger if exists party_opening_balance on public.customers;
create trigger party_opening_balance after insert on public.customers
  for each row execute function public.party_opening_balance();
drop trigger if exists party_opening_balance on public.suppliers;
create trigger party_opening_balance after insert on public.suppliers
  for each row execute function public.party_opening_balance();

-- unified party statement (base currency)
create or replace view public.v_party_statement
with (security_invoker=on) as
select p.party_type, p.party_id, p.date, 'opening' as doc_type, p.code as ref_no,
  'رصيد افتتاحي' as description,
  case when p.party_type='customer' then p.opening_balance else 0 end as debit,
  case when p.party_type='supplier' then p.opening_balance else 0 end as credit
from (select 'customer' as party_type, id as party_id, created_at::date as date, code, opening_balance from public.customers where deleted_at is null
      union all
      select 'supplier', id, created_at::date, code, opening_balance from public.suppliers where deleted_at is null) p
where p.opening_balance > 0
union all
select i.party_type, i.party_id, i.date, i.kind, i.ref_no,
  coalesce(i.notes, '') ,
  case when i.party_type='customer' and i.kind='sale' then i.total*i.fx_rate
       when i.party_type='supplier' and i.kind in ('purchase_return') then i.total*i.fx_rate else 0 end,
  case when i.party_type='customer' and i.kind='sale_return' then i.total*i.fx_rate
       when i.party_type='supplier' and i.kind='purchase' then i.total*i.fx_rate else 0 end
from public.invoices i
where i.deleted_at is null and i.status not in ('cancelled','new','quote') and i.kind <> 'quote'
union all
select p.party_type, p.party_id, p.date, p.kind, p.ref_no, coalesce(p.notes,''),
  case when p.kind='payment' then p.amount*p.fx_rate else 0 end,
  case when p.kind='receipt' then p.amount*p.fx_rate else 0 end
from public.payments p
where p.deleted_at is null and p.status='approved' and p.party_type in ('customer','supplier') and p.party_id is not null;

-- per-party totals
create or replace view public.v_party_summary
with (security_invoker=on) as
select party_type, party_id,
  sum(debit) as total_debit, sum(credit) as total_credit,
  sum(debit) - sum(credit) as balance
from public.v_party_statement
group by party_type, party_id;

grant select on public.v_party_statement to authenticated;
grant select on public.v_party_summary to authenticated;
