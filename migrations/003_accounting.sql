-- Phase 3: accounting & treasuries logic

-- 1) auto-create a linked GL account under 1100 for every new cashbox
create or replace function public.cashbox_account_link() returns trigger
language plpgsql security definer set search_path = public as $$
declare parent uuid; newcode text;
begin
  if new.account_id is null then
    select id into parent from public.accounts where code = '1100';
    newcode := '11' || lpad(nextval('public.ref_seq')::text, 4, '0');
    insert into public.accounts (code, name, type, parent_id, created_by)
      values (newcode, new.name, 'asset', parent, auth.uid())
      returning id into new.account_id;
  end if;
  return new;
end $$;
drop trigger if exists cashbox_account_link on public.cashboxes;
create trigger cashbox_account_link before insert on public.cashboxes
  for each row execute function public.cashbox_account_link();

-- 2) auto-post a balanced double-entry journal for every approved voucher + overdraw guard
create or replace function public.post_payment_journal() returns trigger
language plpgsql security definer set search_path = public as $$
declare cb record; j uuid; counter uuid; bal numeric;
begin
  if new.status <> 'approved' then return new; end if;
  if tg_op = 'UPDATE' and old.journal_id is not null then return new; end if;
  select * into cb from public.cashboxes where id = new.cashbox_id and deleted_at is null;
  if cb.id is null then raise exception 'cashbox not found'; end if;
  if new.kind = 'payment' and not public.has_perm('treasury.overdraw') then
    select coalesce(sum(case when p.kind='receipt' then p.amount*p.fx_rate else -p.amount*p.fx_rate end),0)
      into bal from public.payments p
      where p.cashbox_id = new.cashbox_id and p.deleted_at is null and p.status='approved';
    if bal < new.amount * new.fx_rate then
      raise exception 'رصيد الخزينة غير كافٍ (المتاح %)', bal;
    end if;
  end if;
  counter := case new.party_type
    when 'customer' then (select id from public.accounts where code='1200')
    when 'supplier' then (select id from public.accounts where code='2100')
    when 'employee' then (select id from public.accounts where code='1400')
    else (select id from public.accounts where code='5200') end;
  insert into public.journals (date, description, status, source_type, source_id, created_by)
    values (new.date,
      (case when new.kind='receipt' then 'سند قبض ' else 'سند صرف ' end) || new.ref_no
        || coalesce(' — ' || new.notes, ''),
      'approved', 'payment', new.id, new.created_by)
    returning id into j;
  if new.kind = 'receipt' then
    insert into public.journal_lines (journal_id, account_id, debit, credit, currency, fx_rate, party_type, party_id, description)
      values (j, cb.account_id, new.amount, 0, new.currency, new.fx_rate, new.party_type, new.party_id, new.notes),
             (j, counter, 0, new.amount, new.currency, new.fx_rate, new.party_type, new.party_id, new.notes);
  else
    insert into public.journal_lines (journal_id, account_id, debit, credit, currency, fx_rate, party_type, party_id, description)
      values (j, counter, new.amount, 0, new.currency, new.fx_rate, new.party_type, new.party_id, new.notes),
             (j, cb.account_id, 0, new.amount, new.currency, new.fx_rate, new.party_type, new.party_id, new.notes);
  end if;
  new.journal_id := j;
  return new;
end $$;
drop trigger if exists post_payment_journal on public.payments;
create trigger post_payment_journal before insert or update on public.payments
  for each row execute function public.post_payment_journal();

-- 3) trial balance (approved journals, base currency)
create or replace view public.v_trial_balance
with (security_invoker=on) as
select a.id, a.code, a.name, a.type, a.parent_id,
  coalesce(sum(case when j.id is not null then l.debit * l.fx_rate end), 0)  as total_debit,
  coalesce(sum(case when j.id is not null then l.credit * l.fx_rate end), 0) as total_credit,
  coalesce(sum(case when j.id is not null then (l.debit - l.credit) * l.fx_rate end), 0) as balance
from public.accounts a
left join public.journal_lines l on l.account_id = a.id
left join public.journals j on j.id = l.journal_id and j.status = 'approved' and j.deleted_at is null
where a.deleted_at is null and a.is_active
group by a.id, a.code, a.name, a.type, a.parent_id;

-- 4) ledger lines joined for account statements
create or replace view public.v_ledger
with (security_invoker=on) as
select l.id, l.account_id, a.code as account_code, a.name as account_name,
  j.id as journal_id, j.ref_no, j.date, j.description as journal_description, j.status, j.source_type,
  l.debit, l.credit, l.currency, l.fx_rate, l.party_type, l.party_id, l.description
from public.journal_lines l
join public.journals j on j.id = l.journal_id and j.deleted_at is null
join public.accounts a on a.id = l.account_id;

grant select on public.v_trial_balance to authenticated;
grant select on public.v_ledger to authenticated;
