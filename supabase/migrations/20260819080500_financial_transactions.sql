create table public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  type public.transaction_type not null,
  description text not null,
  category_id uuid references public.financial_categories (id),
  supplier_id uuid references public.suppliers (id),
  amount_cents bigint not null check (amount_cents > 0),
  occurred_on date not null,
  responsible_id uuid references public.profiles (id),
  payment_method_id uuid references public.payment_methods (id),
  origin text,
  notes text,
  attachment_id uuid references public.attachments (id),
  raffle_id uuid references public.raffles (id),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index financial_transactions_type_idx on public.financial_transactions (type);
create index financial_transactions_category_idx on public.financial_transactions (category_id);
create index financial_transactions_occurred_on_idx on public.financial_transactions (occurred_on);
create index financial_transactions_deleted_at_idx on public.financial_transactions (deleted_at);

create trigger financial_transactions_set_updated_at
  before update on public.financial_transactions
  for each row execute function public.set_updated_at();

-- Every edit to a settled transaction must carry a reason and leave a trail —
-- no silently changing a value and moving on. Reason is only required once
-- the row has actually left the DB in a "just created" state (i.e. on real
-- edits, not the initial insert-then-immediate-correction within the same
-- request, which the app never does anyway).
create or replace function public.log_financial_transaction_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text;
begin
  v_reason := current_setting('app.financial_edit_reason', true);

  if (new.amount_cents is distinct from old.amount_cents
      or new.description is distinct from old.description
      or new.category_id is distinct from old.category_id
      or new.deleted_at is distinct from old.deleted_at)
     and coalesce(v_reason, '') = '' then
    raise exception 'É necessário informar o motivo da alteração.';
  end if;

  perform public.log_audit(
    'FINANCIAL_TRANSACTION_UPDATED',
    'financial_transaction',
    new.id,
    to_jsonb(old),
    to_jsonb(new),
    jsonb_build_object('reason', v_reason)
  );
  return new;
end;
$$;

create trigger financial_transactions_audit
  after update on public.financial_transactions
  for each row execute function public.log_financial_transaction_change();

create or replace function public.log_financial_transaction_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.log_audit('FINANCIAL_TRANSACTION_CREATED', 'financial_transaction', new.id, null, to_jsonb(new));
  return new;
end;
$$;

create trigger financial_transactions_audit_insert
  after insert on public.financial_transactions
  for each row execute function public.log_financial_transaction_insert();

alter table public.financial_transactions enable row level security;

create policy financial_transactions_select on public.financial_transactions
  for select using (public.is_admin() or public.auth_role() = 'VISUALIZADOR');

create policy financial_transactions_write on public.financial_transactions
  for all using (public.is_admin()) with check (public.is_admin());
