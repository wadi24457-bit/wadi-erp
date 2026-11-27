-- Phase 4: expenses, HR, advances

-- 1) expense category -> GL sub-account (auto-created under 5200/5300)
create or replace function public.expense_account(p_category text) returns uuid
language plpgsql security definer set search_path = public as $$
declare acct uuid; parent uuid; prefix text;
begin
  select id into acct from public.accounts where name = p_category and deleted_at is null;
  if acct is not null then return acct; end if;
  prefix := case when p_category = 'رواتب' then '53' else '52' end;
  select id into parent from public.accounts where code = prefix || '00';
  insert into public.accounts (code, name, type, parent_id, created_by)
    values (prefix || lpad(nextval('public.ref_seq')::text, 4, '0'), p_category, 'expense', parent, auth.uid())
    returning id into acct;
  return acct;
end $$;

-- 2) expense auto-post: payment source mandatory, overdraw guard, Dr expense / Cr cashbox
create or replace function public.post_expense_journal() returns trigger
language plpgsql security definer set search_path = public as $$
declare cb record; j uuid; acct uuid; bal numeric;
begin
  if new.cashbox_id is null then
    raise exception 'لا يمكن تسجيل مصروف دون تحديد مصدر الدفع (الخزينة)';
  end if;
  select * into cb from public.cashboxes where id = new.cashbox_id and deleted_at is null;
  if cb.id is null then raise exception 'cashbox not found'; end if;
  if not public.has_perm('treasury.overdraw') then
    select coalesce(sum(case when p.kind='receipt' then p.amount*p.fx_rate else -p.amount*p.fx_rate end),0)
      into bal from public.payments p
      where p.cashbox_id = new.cashbox_id and p.deleted_at is null and p.status='approved';
    bal := bal - coalesce((select sum(e.amount*e.fx_rate) from public.expenses e
      where e.cashbox_id = new.cashbox_id and e.deleted_at is null and e.id <> new.id), 0);
    if bal < new.amount * new.fx_rate then
      raise exception 'رصيد الخزينة غير كافٍ (المتاح %)', bal;
    end if;
  end if;
  acct := public.expense_account(new.category);
  insert into public.journals (date, description, status, source_type, source_id, created_by)
    values (new.date, 'مصروف ' || new.category || ' ' || new.ref_no || coalesce(' — ' || new.notes, ''),
            'draft', 'expense', new.id, new.created_by)
    returning id into j;
  insert into public.journal_lines (journal_id, account_id, debit, credit, currency, fx_rate, description)
    values (j, acct, new.amount, 0, new.currency, new.fx_rate, new.notes),
           (j, cb.account_id, 0, new.amount, new.currency, new.fx_rate, new.notes);
  update public.journals set status='approved' where id = j;
  new.journal_id := j;
  return new;
end $$;
drop trigger if exists post_expense_journal on public.expenses;
create trigger post_expense_journal before insert on public.expenses
  for each row execute function public.post_expense_journal();

-- 3) advance lifecycle: approval permission, disbursement posts Dr 1400 / Cr cashbox, installment schedule
create or replace function public.advance_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare cb record; j uuid; bal numeric; n int; i int;
begin
  if tg_op = 'UPDATE' and new.status = 'approved' and old.status = 'pending' then
    if not public.has_perm('advances.approve') then
      raise exception 'لا تملك صلاحية اعتماد السلف';
    end if;
    new.approved_by := auth.uid(); new.approved_at := now();
  end if;
  if tg_op = 'UPDATE' and new.status = 'disbursed' and old.status = 'approved' then
    if new.disbursed_amount <= 0 then new.disbursed_amount := new.amount; end if;
    if new.cashbox_id is null then
      raise exception 'حدد خزينة الصرف قبل صرف السلفة';
    end if;
    select * into cb from public.cashboxes where id = new.cashbox_id and deleted_at is null;
    if cb.id is null then raise exception 'cashbox not found'; end if;
    if not public.has_perm('treasury.overdraw') then
      select coalesce(sum(case when p.kind='receipt' then p.amount*p.fx_rate else -p.amount*p.fx_rate end),0)
        into bal from public.payments p
        where p.cashbox_id = new.cashbox_id and p.deleted_at is null and p.status='approved';
      if bal < new.disbursed_amount then
        raise exception 'رصيد الخزينة غير كافٍ (المتاح %)', bal;
      end if;
    end if;
    insert into public.journals (date, description, status, source_type, source_id, created_by)
      values (current_date, 'صرف سلفة ' || new.ref_no || coalesce(' — ' || new.reason, ''),
              'draft', 'advance', new.id, new.created_by)
      returning id into j;
    insert into public.journal_lines (journal_id, account_id, debit, credit, description, party_type, party_id)
      values (j, (select id from public.accounts where code='1400'), new.disbursed_amount, 0, new.reason, 'employee', new.employee_id),
             (j, cb.account_id, 0, new.disbursed_amount, new.reason, 'employee', new.employee_id);
    update public.journals set status='approved' where id = j;
    new.journal_id := j;
    new.disbursed_at := now();
    new.remaining := new.disbursed_amount;
    if new.installment_amount > 0 then
      delete from public.advance_installments where advance_id = new.id;
      n := ceil(new.disbursed_amount / new.installment_amount);
      for i in 1..n loop
        insert into public.advance_installments (advance_id, amount, due_date)
          values (new.id, least(new.installment_amount, new.disbursed_amount - new.installment_amount*(i-1)),
                  (date_trunc('month', current_date) + (i || ' month')::interval)::date);
      end loop;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists advance_guard on public.advances;
create trigger advance_guard before insert or update on public.advances
  for each row execute function public.advance_guard();

-- 4) installment payment reduces remaining; settle at zero
create or replace function public.advance_installment_paid() returns trigger
language plpgsql security definer set search_path = public as $$
declare adv record; paid_total numeric;
begin
  if tg_op = 'UPDATE' and new.paid_date is not null and old.paid_date is null then
    select * into adv from public.advances where id = new.advance_id;
    select coalesce(sum(amount),0) into paid_total from public.advance_installments
      where advance_id = new.advance_id and paid_date is not null;
    update public.advances set
      remaining = greatest(disbursed_amount - paid_total, 0),
      status = case when disbursed_amount - paid_total <= 0.005 then 'settled' else status end
      where id = new.advance_id;
  end if;
  return new;
end $$;
drop trigger if exists advance_installment_paid on public.advance_installments;
create trigger advance_installment_paid after update on public.advance_installments
  for each row execute function public.advance_installment_paid();

-- 5) views
create or replace view public.v_advance_book
with (security_invoker=on) as
select a.id, a.ref_no, e.name as employee_name, e.job_title, a.amount, a.reason, a.request_date,
  a.status, a.disbursed_amount, a.disbursed_at, a.repayment_method, a.installment_amount, a.remaining,
  (select count(*) from public.advance_installments i where i.advance_id = a.id and i.paid_date is not null) as paid_installments,
  (select count(*) from public.advance_installments i where i.advance_id = a.id) as total_installments
from public.advances a join public.employees e on e.id = a.employee_id
where a.deleted_at is null;

create or replace view public.v_budget_compare
with (security_invoker=on) as
select b.month, b.category, b.amount as budget,
  coalesce((select sum(e.amount * e.fx_rate) from public.expenses e
    where e.category = b.category and to_char(e.date, 'YYYY-MM') = b.month and e.deleted_at is null), 0) as actual
from public.budgets b;

grant select on public.v_advance_book to authenticated;
grant select on public.v_budget_compare to authenticated;
