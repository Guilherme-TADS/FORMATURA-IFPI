-- BUNDLED SUPABASE SCHEMA MIGRATIONS
-- Generated automatically


-- ==========================================
-- MIGRATION: 20260819080000_extensions_and_enums.sql
-- ==========================================

-- Extensions
create extension if not exists pg_cron;

-- Enums
create type public.user_role as enum ('ADMIN', 'VENDEDOR', 'VISUALIZADOR');
create type public.raffle_status as enum ('OPEN', 'CLOSED', 'CANCELLED');
create type public.point_status as enum ('AVAILABLE', 'RESERVED', 'SOLD', 'CANCELLED');
create type public.sale_status as enum ('CONFIRMED', 'CANCELLED');
create type public.attachment_status as enum ('PENDING', 'UPLOADING', 'UPLOADED', 'FAILED');
create type public.transaction_type as enum ('INCOME', 'EXPENSE');

-- Generic updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ==========================================
-- MIGRATION: 20260819080100_profiles_and_auth.sql
-- ==========================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  phone text,
  role public.user_role not null default 'VENDEDOR',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Role/permission helpers. SECURITY DEFINER + STABLE so they can be used
-- freely inside RLS policies without recursive-RLS issues or per-row
-- re-evaluation cost.
create or replace function public.auth_role()
returns public.user_role
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and active = true;
$$;

create or replace function public.is_active_user()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active = true);
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.auth_role() = 'ADMIN';
$$;

create or replace function public.is_vendedor_or_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.auth_role() in ('ADMIN', 'VENDEDOR');
$$;

-- New Supabase Auth users get a profile automatically. Role/full_name can be
-- seeded via raw_user_meta_data at creation time (e.g. from the admin "invite
-- user" flow); defaults to VENDEDOR otherwise. Nothing here trusts anything
-- the browser sends after signup — only what the inviting admin set server-side.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email, 'Sem nome'),
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'VENDEDOR')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Prevent a user from promoting themselves or reactivating their own
-- disabled account by editing their own profile row.
create or replace function public.prevent_self_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.id and not public.is_admin() then
    if new.role is distinct from old.role or new.active is distinct from old.active then
      raise exception 'Você não pode alterar seu próprio papel ou status de ativação.';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_self_escalation
  before update on public.profiles
  for each row execute function public.prevent_self_privilege_escalation();

alter table public.profiles enable row level security;

create policy profiles_select on public.profiles
  for select
  using (auth.uid() = id or public.is_admin());

create policy profiles_update on public.profiles
  for update
  using (auth.uid() = id or public.is_admin());


-- ==========================================
-- MIGRATION: 20260819080200_reference_tables.sql
-- ==========================================

-- Payment methods (shared by raffle sales and financial transactions)
create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.payment_methods enable row level security;

create policy payment_methods_select on public.payment_methods
  for select using (public.is_active_user());

create policy payment_methods_write on public.payment_methods
  for all using (public.is_admin()) with check (public.is_admin());

-- Financial categories
create table public.financial_categories (
  id uuid primary key default gen_random_uuid(),
  kind public.transaction_type not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (kind, name)
);

alter table public.financial_categories enable row level security;

create policy financial_categories_select on public.financial_categories
  for select using (public.is_admin() or public.auth_role() = 'VISUALIZADOR');

create policy financial_categories_write on public.financial_categories
  for all using (public.is_admin()) with check (public.is_admin());

-- Suppliers
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document text,
  contact text,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.suppliers enable row level security;

create policy suppliers_select on public.suppliers
  for select using (public.is_admin() or public.auth_role() = 'VISUALIZADOR');

create policy suppliers_write on public.suppliers
  for all using (public.is_admin()) with check (public.is_admin());

-- System settings: simple key/value store, value is jsonb so any setting
-- shape fits without new columns/migrations.
create table public.system_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

alter table public.system_settings enable row level security;

create policy system_settings_select on public.system_settings
  for select using (public.is_active_user());

create policy system_settings_write on public.system_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- Attachments: metadata only. The file itself lives in Supabase Storage
-- (temp_storage_path) until the Google Drive integration is configured, at
-- which point drive_file_id/drive_url get populated and status -> UPLOADED.
-- entity_id is nullable because uploads for anonymous public raffle
-- purchases happen before the sale row exists (see /api/uploads route).
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('raffle_sale', 'financial_transaction', 'raffle', 'document')),
  entity_id uuid,
  kind text not null default 'comprovante'
    check (kind in ('comprovante', 'nota_fiscal', 'contrato', 'orcamento', 'recibo', 'imagem', 'documento', 'outro')),
  status public.attachment_status not null default 'PENDING',
  temp_storage_path text,
  drive_file_id text,
  drive_url text,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  description text,
  uploaded_by uuid references public.profiles (id),
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index attachments_entity_idx on public.attachments (entity_type, entity_id);

alter table public.attachments enable row level security;

create policy attachments_select on public.attachments
  for select using (public.is_active_user());

create policy attachments_admin_write on public.attachments
  for all using (public.is_admin()) with check (public.is_admin());

-- Audit log. Never store secrets/tokens/passwords in old_data/new_data/metadata.
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  metadata jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);

create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_created_at_idx on public.audit_logs (created_at);
create index audit_logs_user_idx on public.audit_logs (user_id);

alter table public.audit_logs enable row level security;

create policy audit_logs_select on public.audit_logs
  for select using (public.is_admin());

-- No insert/update/delete policy: audit rows are only ever written by
-- SECURITY DEFINER functions via public.log_audit(), never directly by clients.
create or replace function public.log_audit(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_old_data jsonb default null,
  p_new_data jsonb default null,
  p_metadata jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (user_id, action, entity_type, entity_id, old_data, new_data, metadata)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_old_data, p_new_data, p_metadata);
end;
$$;

-- Best-effort abuse guard for anonymous public RPCs (reserve/confirm). Not a
-- hard security boundary, just makes casual scripted abuse harder. No client
-- access at all — only SECURITY DEFINER functions touch this table.
create table public.rate_limit_events (
  id bigserial primary key,
  bucket text not null,
  identifier text not null,
  created_at timestamptz not null default now()
);

create index rate_limit_events_lookup_idx on public.rate_limit_events (bucket, identifier, created_at);

alter table public.rate_limit_events enable row level security;
-- Intentionally no policies: table is fully inaccessible to PostgREST roles.

create or replace function public.check_rate_limit(
  p_bucket text,
  p_identifier text,
  p_max_events integer,
  p_window_seconds integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.rate_limit_events
  where bucket = p_bucket
    and identifier = p_identifier
    and created_at > now() - make_interval(secs => p_window_seconds);

  if v_count >= p_max_events then
    raise exception 'Muitas tentativas em pouco tempo. Aguarde um instante e tente novamente.'
      using errcode = 'P0001';
  end if;

  insert into public.rate_limit_events (bucket, identifier) values (p_bucket, p_identifier);
end;
$$;


-- ==========================================
-- MIGRATION: 20260819080300_raffles.sql
-- ==========================================

create table public.raffles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  rules text,
  image_url text,
  total_points integer not null check (total_points > 0 and total_points <= 100000),
  unit_price_cents bigint not null check (unit_price_cents > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.raffle_status not null default 'OPEN',
  google_sheet_url text,
  internal_notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint raffles_dates_check check (ends_at > starts_at),
  constraint raffles_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create trigger raffles_set_updated_at
  before update on public.raffles
  for each row execute function public.set_updated_at();

create table public.raffle_points (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references public.raffles (id) on delete cascade,
  point_number integer not null,
  status public.point_status not null default 'AVAILABLE',
  reserved_until timestamptz,
  reservation_token uuid,
  updated_at timestamptz not null default now(),
  unique (raffle_id, point_number)
);

create index raffle_points_raffle_status_idx on public.raffle_points (raffle_id, status);
create index raffle_points_reservation_token_idx on public.raffle_points (reservation_token) where reservation_token is not null;
create index raffle_points_expiry_idx on public.raffle_points (status, reserved_until) where status = 'RESERVED';

create trigger raffle_points_set_updated_at
  before update on public.raffle_points
  for each row execute function public.set_updated_at();

-- Points are generated atomically with the raffle: if this trigger fails the
-- whole INSERT into raffles rolls back, so a raffle can never exist half-seeded.
create or replace function public.generate_raffle_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.raffle_points (raffle_id, point_number)
  select new.id, generate_series(1, new.total_points);
  return new;
end;
$$;

create trigger raffles_generate_points
  after insert on public.raffles
  for each row execute function public.generate_raffle_points();

alter table public.raffles enable row level security;
alter table public.raffle_points enable row level security;

-- Internal (admin/vendedor/visualizador) access to full rows.
create policy raffles_select on public.raffles
  for select using (public.is_active_user());

create policy raffles_write on public.raffles
  for all using (public.is_admin()) with check (public.is_admin());

create policy raffle_points_select on public.raffle_points
  for select using (public.is_active_user());

-- No insert/update/delete policy on raffle_points for any client role: every
-- mutation goes through SECURITY DEFINER RPCs (rpc_reserve_points,
-- rpc_confirm_sale, rpc_cancel_sale, rpc_release_expired_reservations).

-- Public-safe views. Views default to security_invoker = false, i.e. they
-- run with the view owner's privileges rather than the querying role's — so
-- granting SELECT on these views to anon exposes exactly these columns,
-- without opening up the underlying tables (which have no anon policy at all).
create view public.public_raffles
  with (security_invoker = false) as
  select id, slug, title, description, rules, image_url, total_points,
         unit_price_cents, starts_at, ends_at, status, google_sheet_url, created_at
  from public.raffles
  where status in ('OPEN', 'CLOSED');

create view public.public_raffle_points
  with (security_invoker = false) as
  select rp.raffle_id, rp.point_number, rp.status
  from public.raffle_points rp
  join public.raffles r on r.id = rp.raffle_id
  where r.status in ('OPEN', 'CLOSED');

grant select on public.public_raffles to anon, authenticated;
grant select on public.public_raffle_points to anon, authenticated;


-- ==========================================
-- MIGRATION: 20260819080400_raffle_sales.sql
-- ==========================================

create table public.buyers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  whatsapp text,
  instagram text,
  notes text,
  created_at timestamptz not null default now()
);

create index buyers_phone_idx on public.buyers (phone);
create index buyers_whatsapp_idx on public.buyers (whatsapp);
create index buyers_full_name_idx on public.buyers (full_name);

alter table public.buyers enable row level security;

create policy buyers_select on public.buyers
  for select using (public.is_active_user());

create policy buyers_admin_update on public.buyers
  for update using (public.is_admin()) with check (public.is_admin());

-- No insert policy: buyers are only created inside rpc_confirm_sale.

create table public.raffle_sales (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references public.raffles (id),
  buyer_id uuid not null references public.buyers (id),
  seller_id uuid references public.profiles (id),
  payment_method_id uuid not null references public.payment_methods (id),
  amount_cents bigint not null check (amount_cents > 0),
  status public.sale_status not null default 'CONFIRMED',
  idempotency_key uuid not null unique,
  cancelled_reason text,
  cancelled_by uuid references public.profiles (id),
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);

create index raffle_sales_raffle_idx on public.raffle_sales (raffle_id);
create index raffle_sales_buyer_idx on public.raffle_sales (buyer_id);
create index raffle_sales_seller_idx on public.raffle_sales (seller_id);
create index raffle_sales_created_at_idx on public.raffle_sales (created_at);
create index raffle_sales_status_idx on public.raffle_sales (status);

alter table public.raffle_sales enable row level security;

create policy raffle_sales_select on public.raffle_sales
  for select using (public.is_active_user());

-- No insert/update/delete policy: only rpc_confirm_sale / rpc_cancel_sale.

create table public.raffle_sale_points (
  sale_id uuid not null references public.raffle_sales (id) on delete cascade,
  point_id uuid not null references public.raffle_points (id),
  primary key (sale_id, point_id)
);

alter table public.raffle_sale_points enable row level security;

create policy raffle_sale_points_select on public.raffle_sale_points
  for select using (public.is_active_user());

create table public.payment_records (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.raffle_sales (id) on delete cascade,
  payment_method_id uuid not null references public.payment_methods (id),
  amount_cents bigint not null check (amount_cents > 0),
  paid_at timestamptz not null default now(),
  reference_note text,
  created_at timestamptz not null default now()
);

create index payment_records_sale_idx on public.payment_records (sale_id);

alter table public.payment_records enable row level security;

create policy payment_records_select on public.payment_records
  for select using (public.is_active_user());


-- ==========================================
-- MIGRATION: 20260819080500_financial_transactions.sql
-- ==========================================

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


-- ==========================================
-- MIGRATION: 20260819080600_rpc_functions.sql
-- ==========================================

-- ============================================================================
-- rpc_reserve_points
--
-- Atomically claims a set of AVAILABLE points for a raffle. If ANY requested
-- point is not AVAILABLE, the whole call fails and nothing is reserved (the
-- exception aborts the function's implicit transaction, rolling back any
-- partial UPDATEs already applied in this invocation).
-- ============================================================================
create or replace function public.rpc_reserve_points(
  p_raffle_id uuid,
  p_point_numbers integer[],
  p_reservation_token uuid,
  p_client_identifier text default null,
  p_ttl_minutes integer default 15
)
returns table (point_number integer, reserved_until timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raffle public.raffles%rowtype;
  v_reserved_count integer;
  v_requested_count integer;
begin
  if p_point_numbers is null or array_length(p_point_numbers, 1) is null then
    raise exception 'Selecione ao menos um número.';
  end if;

  v_requested_count := array_length(p_point_numbers, 1);
  if v_requested_count > 50 then
    raise exception 'Selecione no máximo 50 números por reserva.';
  end if;

  perform public.check_rate_limit(
    'reserve_points',
    coalesce(p_client_identifier, p_reservation_token::text),
    20,
    60
  );

  select * into v_raffle from public.raffles where id = p_raffle_id for share;

  if not found then
    raise exception 'Rifa não encontrada.';
  end if;

  if v_raffle.status <> 'OPEN' then
    raise exception 'Esta rifa não está aberta para vendas.';
  end if;

  if now() > v_raffle.ends_at then
    raise exception 'O prazo desta rifa já foi encerrado.';
  end if;

  with claimed as (
    update public.raffle_points
    set status = 'RESERVED',
        reserved_until = now() + make_interval(mins => p_ttl_minutes),
        reservation_token = p_reservation_token
    where raffle_id = p_raffle_id
      and point_number = any (p_point_numbers)
      and status = 'AVAILABLE'
    returning raffle_points.point_number, raffle_points.reserved_until
  )
  select count(*) into v_reserved_count from claimed;

  if v_reserved_count <> v_requested_count then
    raise exception 'Um ou mais números escolhidos acabaram de ser reservados por outra pessoa. Escolha outros números para continuar.';
  end if;

  perform public.log_audit(
    'RESERVE',
    'raffle_point',
    p_raffle_id,
    null,
    jsonb_build_object('point_numbers', p_point_numbers, 'reservation_token', p_reservation_token)
  );

  return query
    select rp.point_number, rp.reserved_until
    from public.raffle_points rp
    where rp.raffle_id = p_raffle_id
      and rp.point_number = any (p_point_numbers);
end;
$$;

grant execute on function public.rpc_reserve_points(uuid, integer[], uuid, text, integer) to anon, authenticated;

-- ============================================================================
-- rpc_release_expired_reservations
--
-- Called every minute by pg_cron. Also invoked defensively at the top of
-- rpc_confirm_sale so a reservation that expired seconds ago can never be
-- sold, even if the cron tick hasn't run yet.
-- ============================================================================
create or replace function public.rpc_release_expired_reservations()
returns void
language sql
security definer
set search_path = public
as $$
  update public.raffle_points
  set status = 'AVAILABLE', reserved_until = null, reservation_token = null
  where status = 'RESERVED' and reserved_until < now();
$$;

select cron.schedule(
  'release-expired-raffle-reservations',
  '* * * * *',
  $$select public.rpc_release_expired_reservations();$$
);

select cron.schedule(
  'prune-rate-limit-events',
  '0 3 * * *',
  $$delete from public.rate_limit_events where created_at < now() - interval '2 days';$$
);

-- ============================================================================
-- rpc_confirm_sale
--
-- Turns a live reservation into a sale. Idempotent via p_idempotency_key: a
-- retried call (double click, dropped response, client retry) with the same
-- key returns the original sale instead of creating a second one.
--
-- seller_id is ALWAYS auth.uid() (null for an anonymous public buyer) — never
-- a value supplied by the client, so a vendedor can never register a sale
-- under someone else's name.
-- ============================================================================
create or replace function public.rpc_confirm_sale(
  p_raffle_id uuid,
  p_reservation_token uuid,
  p_buyer_full_name text,
  p_buyer_phone text,
  p_buyer_whatsapp text,
  p_buyer_instagram text,
  p_buyer_notes text,
  p_payment_method_id uuid,
  p_idempotency_key uuid,
  p_client_identifier text default null,
  p_attachment_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_sale_id uuid;
  v_raffle public.raffles%rowtype;
  v_point_ids uuid[];
  v_point_count integer;
  v_amount_cents bigint;
  v_buyer_id uuid;
  v_sale_id uuid;
  v_normalized_phone text;
begin
  select id into v_existing_sale_id from public.raffle_sales where idempotency_key = p_idempotency_key;
  if found then
    return v_existing_sale_id;
  end if;

  perform public.check_rate_limit(
    'confirm_sale',
    coalesce(p_client_identifier, p_reservation_token::text),
    10,
    60
  );

  perform public.rpc_release_expired_reservations();

  select * into v_raffle from public.raffles where id = p_raffle_id for share;
  if not found then
    raise exception 'Rifa não encontrada.';
  end if;
  if v_raffle.status <> 'OPEN' then
    raise exception 'Esta rifa já foi encerrada.';
  end if;

  if p_buyer_full_name is null or length(trim(p_buyer_full_name)) < 3 then
    raise exception 'Informe o nome completo do comprador.';
  end if;
  if p_buyer_phone is null or length(regexp_replace(p_buyer_phone, '\D', '', 'g')) < 8 then
    raise exception 'Informe um telefone válido.';
  end if;

  select array_agg(id) into v_point_ids
  from public.raffle_points
  where raffle_id = p_raffle_id
    and reservation_token = p_reservation_token
    and status = 'RESERVED'
    and reserved_until > now()
  for update;

  v_point_count := coalesce(array_length(v_point_ids, 1), 0);
  if v_point_count = 0 then
    raise exception 'Esta reserva expirou. Selecione os números novamente.';
  end if;

  v_amount_cents := v_point_count * v_raffle.unit_price_cents;

  v_normalized_phone := regexp_replace(p_buyer_phone, '\D', '', 'g');

  select id into v_buyer_id
  from public.buyers
  where regexp_replace(phone, '\D', '', 'g') = v_normalized_phone
    and lower(full_name) = lower(trim(p_buyer_full_name))
  limit 1;

  if v_buyer_id is null then
    insert into public.buyers (full_name, phone, whatsapp, instagram, notes)
    values (trim(p_buyer_full_name), p_buyer_phone, p_buyer_whatsapp, p_buyer_instagram, p_buyer_notes)
    returning id into v_buyer_id;
  end if;

  insert into public.raffle_sales (
    raffle_id, buyer_id, seller_id, payment_method_id, amount_cents, idempotency_key
  )
  values (
    p_raffle_id, v_buyer_id, auth.uid(), p_payment_method_id, v_amount_cents, p_idempotency_key
  )
  on conflict (idempotency_key) do nothing
  returning id into v_sale_id;

  if v_sale_id is null then
    -- Lost the idempotency race to a concurrent identical request: the points
    -- we just locked are irrelevant now, return the sale the other request created.
    select id into v_sale_id from public.raffle_sales where idempotency_key = p_idempotency_key;
    return v_sale_id;
  end if;

  insert into public.raffle_sale_points (sale_id, point_id)
  select v_sale_id, unnest(v_point_ids);

  update public.raffle_points
  set status = 'SOLD', reserved_until = null, reservation_token = null
  where id = any (v_point_ids);

  insert into public.payment_records (sale_id, payment_method_id, amount_cents)
  values (v_sale_id, p_payment_method_id, v_amount_cents);

  if p_attachment_id is not null then
    update public.attachments
    set entity_id = v_sale_id, status = 'UPLOADED'
    where id = p_attachment_id and entity_type = 'raffle_sale' and entity_id is null;
  end if;

  perform public.log_audit(
    'SALE_CONFIRMED',
    'raffle_sale',
    v_sale_id,
    null,
    jsonb_build_object(
      'raffle_id', p_raffle_id,
      'buyer_id', v_buyer_id,
      'seller_id', auth.uid(),
      'amount_cents', v_amount_cents,
      'point_count', v_point_count
    )
  );

  return v_sale_id;
end;
$$;

grant execute on function public.rpc_confirm_sale(
  uuid, uuid, text, text, text, text, text, uuid, uuid, text, uuid
) to anon, authenticated;

-- ============================================================================
-- rpc_cancel_sale
--
-- Admin-only. Cancellation is always auditable: the sale row is kept with
-- status CANCELLED (never deleted), points either return to AVAILABLE or move
-- to CANCELLED depending on p_return_to_available.
-- ============================================================================
create or replace function public.rpc_cancel_sale(
  p_sale_id uuid,
  p_reason text,
  p_return_to_available boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.raffle_sales%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem cancelar uma venda.';
  end if;

  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'Informe o motivo do cancelamento.';
  end if;

  select * into v_sale from public.raffle_sales where id = p_sale_id for update;
  if not found then
    raise exception 'Venda não encontrada.';
  end if;
  if v_sale.status = 'CANCELLED' then
    raise exception 'Esta venda já foi cancelada.';
  end if;

  update public.raffle_sales
  set status = 'CANCELLED', cancelled_reason = p_reason, cancelled_by = auth.uid(), cancelled_at = now()
  where id = p_sale_id;

  update public.raffle_points
  set status = case when p_return_to_available then 'AVAILABLE' else 'CANCELLED' end,
      reserved_until = null,
      reservation_token = null
  where id in (select point_id from public.raffle_sale_points where sale_id = p_sale_id);

  perform public.log_audit(
    'SALE_CANCELLED',
    'raffle_sale',
    p_sale_id,
    to_jsonb(v_sale),
    jsonb_build_object('reason', p_reason, 'return_to_available', p_return_to_available)
  );
end;
$$;

grant execute on function public.rpc_cancel_sale(uuid, text, boolean) to authenticated;

-- ============================================================================
-- rpc_close_raffle / rpc_cancel_raffle
-- ============================================================================
create or replace function public.rpc_close_raffle(p_raffle_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.raffles%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem encerrar uma rifa.';
  end if;

  select * into v_old from public.raffles where id = p_raffle_id for update;
  if not found then
    raise exception 'Rifa não encontrada.';
  end if;
  if v_old.status <> 'OPEN' then
    raise exception 'Esta rifa não está aberta.';
  end if;

  update public.raffles set status = 'CLOSED' where id = p_raffle_id;

  perform public.log_audit('RAFFLE_CLOSED', 'raffle', p_raffle_id, to_jsonb(v_old), jsonb_build_object('status', 'CLOSED'));
end;
$$;

grant execute on function public.rpc_close_raffle(uuid) to authenticated;

create or replace function public.rpc_cancel_raffle(p_raffle_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.raffles%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem cancelar uma rifa.';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'Informe o motivo do cancelamento.';
  end if;

  select * into v_old from public.raffles where id = p_raffle_id for update;
  if not found then
    raise exception 'Rifa não encontrada.';
  end if;
  if v_old.status = 'CANCELLED' then
    raise exception 'Esta rifa já foi cancelada.';
  end if;

  update public.raffles set status = 'CANCELLED' where id = p_raffle_id;

  perform public.log_audit(
    'RAFFLE_CANCELLED', 'raffle', p_raffle_id, to_jsonb(v_old),
    jsonb_build_object('status', 'CANCELLED', 'reason', p_reason)
  );
end;
$$;

grant execute on function public.rpc_cancel_raffle(uuid, text) to authenticated;

-- ============================================================================
-- rpc_update_financial_transaction
--
-- The only sanctioned path for editing a settled financial transaction: sets
-- the session-local reason the audit trigger requires, then applies the
-- patch. A raw PostgREST UPDATE without going through this function will be
-- rejected by financial_transactions_audit's trigger (no reason available).
-- ============================================================================
create or replace function public.rpc_update_financial_transaction(
  p_id uuid,
  p_description text,
  p_category_id uuid,
  p_amount_cents bigint,
  p_occurred_on date,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem editar lançamentos financeiros.';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'Informe o motivo da alteração.';
  end if;

  perform set_config('app.financial_edit_reason', p_reason, true);

  update public.financial_transactions
  set description = p_description,
      category_id = p_category_id,
      amount_cents = p_amount_cents,
      occurred_on = p_occurred_on
  where id = p_id;

  if not found then
    raise exception 'Lançamento não encontrado.';
  end if;
end;
$$;

grant execute on function public.rpc_update_financial_transaction(uuid, text, uuid, bigint, date, text) to authenticated;


-- ==========================================
-- MIGRATION: 20260819080700_operational_seed_data.sql
-- ==========================================

insert into public.payment_methods (name) values
  ('PIX'),
  ('Dinheiro')
on conflict (name) do nothing;

insert into public.financial_categories (kind, name) values
  ('INCOME', 'Rifa'),
  ('INCOME', 'Eventos'),
  ('INCOME', 'Contribuições'),
  ('INCOME', 'Patrocínio'),
  ('INCOME', 'Outros'),
  ('EXPENSE', 'Buffet'),
  ('EXPENSE', 'Decoração'),
  ('EXPENSE', 'Local'),
  ('EXPENSE', 'Fotografia'),
  ('EXPENSE', 'Música'),
  ('EXPENSE', 'Convites'),
  ('EXPENSE', 'Transporte'),
  ('EXPENSE', 'Taxas'),
  ('EXPENSE', 'Outros')
on conflict (kind, name) do nothing;


-- ==========================================
-- MIGRATION: 20260819081000_fix_rpc_bugs.sql
-- ==========================================

-- Fix 1: in rpc_reserve_points, the bare `point_number` in the UPDATE...WHERE
-- clause was ambiguous against the function's own `point_number` OUT
-- parameter (same name), which made every reservation fail.
--
-- Fix 2: in rpc_confirm_sale, `SELECT array_agg(id) ... FOR UPDATE` is
-- rejected by Postgres (FOR UPDATE can't be combined with aggregates) —
-- split into a locking CTE followed by a separate aggregate over it.
create or replace function public.rpc_reserve_points(
  p_raffle_id uuid,
  p_point_numbers integer[],
  p_reservation_token uuid,
  p_client_identifier text default null,
  p_ttl_minutes integer default 15
)
returns table (point_number integer, reserved_until timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raffle public.raffles%rowtype;
  v_reserved_count integer;
  v_requested_count integer;
begin
  if p_point_numbers is null or array_length(p_point_numbers, 1) is null then
    raise exception 'Selecione ao menos um número.';
  end if;

  v_requested_count := array_length(p_point_numbers, 1);
  if v_requested_count > 50 then
    raise exception 'Selecione no máximo 50 números por reserva.';
  end if;

  perform public.check_rate_limit(
    'reserve_points',
    coalesce(p_client_identifier, p_reservation_token::text),
    20,
    60
  );

  select * into v_raffle from public.raffles where id = p_raffle_id for share;

  if not found then
    raise exception 'Rifa não encontrada.';
  end if;

  if v_raffle.status <> 'OPEN' then
    raise exception 'Esta rifa não está aberta para vendas.';
  end if;

  if now() > v_raffle.ends_at then
    raise exception 'O prazo desta rifa já foi encerrado.';
  end if;

  with claimed as (
    update public.raffle_points
    set status = 'RESERVED',
        reserved_until = now() + make_interval(mins => p_ttl_minutes),
        reservation_token = p_reservation_token
    where raffle_points.raffle_id = p_raffle_id
      and raffle_points.point_number = any (p_point_numbers)
      and raffle_points.status = 'AVAILABLE'
    returning raffle_points.point_number as claimed_point_number
  )
  select count(*) into v_reserved_count from claimed;

  if v_reserved_count <> v_requested_count then
    raise exception 'Um ou mais números escolhidos acabaram de ser reservados por outra pessoa. Escolha outros números para continuar.';
  end if;

  perform public.log_audit(
    'RESERVE',
    'raffle_point',
    p_raffle_id,
    null,
    jsonb_build_object('point_numbers', p_point_numbers, 'reservation_token', p_reservation_token)
  );

  return query
    select rp.point_number, rp.reserved_until
    from public.raffle_points rp
    where rp.raffle_id = p_raffle_id
      and rp.point_number = any (p_point_numbers);
end;
$$;

create or replace function public.rpc_confirm_sale(
  p_raffle_id uuid,
  p_reservation_token uuid,
  p_buyer_full_name text,
  p_buyer_phone text,
  p_buyer_whatsapp text,
  p_buyer_instagram text,
  p_buyer_notes text,
  p_payment_method_id uuid,
  p_idempotency_key uuid,
  p_client_identifier text default null,
  p_attachment_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_sale_id uuid;
  v_raffle public.raffles%rowtype;
  v_point_ids uuid[];
  v_point_count integer;
  v_amount_cents bigint;
  v_buyer_id uuid;
  v_sale_id uuid;
  v_normalized_phone text;
begin
  select id into v_existing_sale_id from public.raffle_sales where idempotency_key = p_idempotency_key;
  if found then
    return v_existing_sale_id;
  end if;

  perform public.check_rate_limit(
    'confirm_sale',
    coalesce(p_client_identifier, p_reservation_token::text),
    10,
    60
  );

  perform public.rpc_release_expired_reservations();

  select * into v_raffle from public.raffles where id = p_raffle_id for share;
  if not found then
    raise exception 'Rifa não encontrada.';
  end if;
  if v_raffle.status <> 'OPEN' then
    raise exception 'Esta rifa já foi encerrada.';
  end if;

  if p_buyer_full_name is null or length(trim(p_buyer_full_name)) < 3 then
    raise exception 'Informe o nome completo do comprador.';
  end if;
  if p_buyer_phone is null or length(regexp_replace(p_buyer_phone, '\D', '', 'g')) < 8 then
    raise exception 'Informe um telefone válido.';
  end if;

  with locked_points as (
    select id
    from public.raffle_points
    where raffle_id = p_raffle_id
      and reservation_token = p_reservation_token
      and status = 'RESERVED'
      and reserved_until > now()
    for update
  )
  select array_agg(id) into v_point_ids from locked_points;

  v_point_count := coalesce(array_length(v_point_ids, 1), 0);
  if v_point_count = 0 then
    raise exception 'Esta reserva expirou. Selecione os números novamente.';
  end if;

  v_amount_cents := v_point_count * v_raffle.unit_price_cents;

  v_normalized_phone := regexp_replace(p_buyer_phone, '\D', '', 'g');

  select id into v_buyer_id
  from public.buyers
  where regexp_replace(phone, '\D', '', 'g') = v_normalized_phone
    and lower(full_name) = lower(trim(p_buyer_full_name))
  limit 1;

  if v_buyer_id is null then
    insert into public.buyers (full_name, phone, whatsapp, instagram, notes)
    values (trim(p_buyer_full_name), p_buyer_phone, p_buyer_whatsapp, p_buyer_instagram, p_buyer_notes)
    returning id into v_buyer_id;
  end if;

  insert into public.raffle_sales (
    raffle_id, buyer_id, seller_id, payment_method_id, amount_cents, idempotency_key
  )
  values (
    p_raffle_id, v_buyer_id, auth.uid(), p_payment_method_id, v_amount_cents, p_idempotency_key
  )
  on conflict (idempotency_key) do nothing
  returning id into v_sale_id;

  if v_sale_id is null then
    select id into v_sale_id from public.raffle_sales where idempotency_key = p_idempotency_key;
    return v_sale_id;
  end if;

  insert into public.raffle_sale_points (sale_id, point_id)
  select v_sale_id, unnest(v_point_ids);

  update public.raffle_points
  set status = 'SOLD', reserved_until = null, reservation_token = null
  where id = any (v_point_ids);

  insert into public.payment_records (sale_id, payment_method_id, amount_cents)
  values (v_sale_id, p_payment_method_id, v_amount_cents);

  if p_attachment_id is not null then
    update public.attachments
    set entity_id = v_sale_id, status = 'UPLOADED'
    where id = p_attachment_id and entity_type = 'raffle_sale' and entity_id is null;
  end if;

  perform public.log_audit(
    'SALE_CONFIRMED',
    'raffle_sale',
    v_sale_id,
    null,
    jsonb_build_object(
      'raffle_id', p_raffle_id,
      'buyer_id', v_buyer_id,
      'seller_id', auth.uid(),
      'amount_cents', v_amount_cents,
      'point_count', v_point_count
    )
  );

  return v_sale_id;
end;
$$;


-- ==========================================
-- MIGRATION: 20260819081100_fix_confirm_sale_idempotency_race.sql
-- ==========================================

-- The idempotency check at the top of rpc_confirm_sale only catches a retry
-- that arrives AFTER the first call already committed. A retry that arrives
-- WHILE the first call is still holding the row lock (SELECT ... FOR UPDATE
-- on the reserved points) blocks, then wakes up to find the points already
-- SOLD by the first call — which looks identical to "someone else's
-- reservation expired" and was incorrectly raising that error instead of
-- returning the sale the concurrent request just created.
create or replace function public.rpc_confirm_sale(
  p_raffle_id uuid,
  p_reservation_token uuid,
  p_buyer_full_name text,
  p_buyer_phone text,
  p_buyer_whatsapp text,
  p_buyer_instagram text,
  p_buyer_notes text,
  p_payment_method_id uuid,
  p_idempotency_key uuid,
  p_client_identifier text default null,
  p_attachment_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_sale_id uuid;
  v_raffle public.raffles%rowtype;
  v_point_ids uuid[];
  v_point_count integer;
  v_amount_cents bigint;
  v_buyer_id uuid;
  v_sale_id uuid;
  v_normalized_phone text;
begin
  select id into v_existing_sale_id from public.raffle_sales where idempotency_key = p_idempotency_key;
  if found then
    return v_existing_sale_id;
  end if;

  perform public.check_rate_limit(
    'confirm_sale',
    coalesce(p_client_identifier, p_reservation_token::text),
    10,
    60
  );

  perform public.rpc_release_expired_reservations();

  select * into v_raffle from public.raffles where id = p_raffle_id for share;
  if not found then
    raise exception 'Rifa não encontrada.';
  end if;
  if v_raffle.status <> 'OPEN' then
    raise exception 'Esta rifa já foi encerrada.';
  end if;

  if p_buyer_full_name is null or length(trim(p_buyer_full_name)) < 3 then
    raise exception 'Informe o nome completo do comprador.';
  end if;
  if p_buyer_phone is null or length(regexp_replace(p_buyer_phone, '\D', '', 'g')) < 8 then
    raise exception 'Informe um telefone válido.';
  end if;

  with locked_points as (
    select id
    from public.raffle_points
    where raffle_id = p_raffle_id
      and reservation_token = p_reservation_token
      and status = 'RESERVED'
      and reserved_until > now()
    for update
  )
  select array_agg(id) into v_point_ids from locked_points;

  v_point_count := coalesce(array_length(v_point_ids, 1), 0);
  if v_point_count = 0 then
    -- Re-check idempotency: we may have just been blocked behind a
    -- concurrent identical request that already consumed these points.
    select id into v_existing_sale_id from public.raffle_sales where idempotency_key = p_idempotency_key;
    if found then
      return v_existing_sale_id;
    end if;
    raise exception 'Esta reserva expirou. Selecione os números novamente.';
  end if;

  v_amount_cents := v_point_count * v_raffle.unit_price_cents;

  v_normalized_phone := regexp_replace(p_buyer_phone, '\D', '', 'g');

  select id into v_buyer_id
  from public.buyers
  where regexp_replace(phone, '\D', '', 'g') = v_normalized_phone
    and lower(full_name) = lower(trim(p_buyer_full_name))
  limit 1;

  if v_buyer_id is null then
    insert into public.buyers (full_name, phone, whatsapp, instagram, notes)
    values (trim(p_buyer_full_name), p_buyer_phone, p_buyer_whatsapp, p_buyer_instagram, p_buyer_notes)
    returning id into v_buyer_id;
  end if;

  insert into public.raffle_sales (
    raffle_id, buyer_id, seller_id, payment_method_id, amount_cents, idempotency_key
  )
  values (
    p_raffle_id, v_buyer_id, auth.uid(), p_payment_method_id, v_amount_cents, p_idempotency_key
  )
  on conflict (idempotency_key) do nothing
  returning id into v_sale_id;

  if v_sale_id is null then
    select id into v_sale_id from public.raffle_sales where idempotency_key = p_idempotency_key;
    return v_sale_id;
  end if;

  insert into public.raffle_sale_points (sale_id, point_id)
  select v_sale_id, unnest(v_point_ids);

  update public.raffle_points
  set status = 'SOLD', reserved_until = null, reservation_token = null
  where id = any (v_point_ids);

  insert into public.payment_records (sale_id, payment_method_id, amount_cents)
  values (v_sale_id, p_payment_method_id, v_amount_cents);

  if p_attachment_id is not null then
    update public.attachments
    set entity_id = v_sale_id, status = 'UPLOADED'
    where id = p_attachment_id and entity_type = 'raffle_sale' and entity_id is null;
  end if;

  perform public.log_audit(
    'SALE_CONFIRMED',
    'raffle_sale',
    v_sale_id,
    null,
    jsonb_build_object(
      'raffle_id', p_raffle_id,
      'buyer_id', v_buyer_id,
      'seller_id', auth.uid(),
      'amount_cents', v_amount_cents,
      'point_count', v_point_count
    )
  );

  return v_sale_id;
end;
$$;


-- ==========================================
-- MIGRATION: 20260819090000_public_purchase_flow.sql
-- ==========================================

-- Public-safe view of payment methods (name + id only) so the anonymous
-- checkout can populate a payment method selector without any grant on the
-- base table, which stays restricted to internal roles.
create view public.public_payment_methods
  with (security_invoker = false) as
  select id, name
  from public.payment_methods
  where active = true;

grant select on public.public_payment_methods to anon, authenticated;

-- Private bucket for raffle payment proofs (and, later, financial
-- attachments). Nothing here is publicly readable — every read/write goes
-- through server-side code using the secret key, which performs its own
-- MIME/size validation before ever touching this bucket.
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

create policy attachments_bucket_staff_read on storage.objects
  for select
  using (bucket_id = 'attachments' and public.is_active_user());

-- Builds the same receipt shape whether the sale was just created or this is
-- an idempotent replay of an already-confirmed sale. SECURITY DEFINER
-- because callers (including anon) have no direct read access to
-- raffle_sales/raffle_sale_points/buyers.
create or replace function public.rpc_get_sale_receipt(p_sale_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'saleId', s.id,
    'raffleTitle', r.title,
    'buyerName', b.full_name,
    'pointNumbers', (
      select jsonb_agg(rp.point_number order by rp.point_number)
      from public.raffle_sale_points rsp
      join public.raffle_points rp on rp.id = rsp.point_id
      where rsp.sale_id = s.id
    ),
    'amountCents', s.amount_cents,
    'paymentMethod', pm.name,
    'createdAt', s.created_at
  )
  from public.raffle_sales s
  join public.raffles r on r.id = s.raffle_id
  join public.buyers b on b.id = s.buyer_id
  join public.payment_methods pm on pm.id = s.payment_method_id
  where s.id = p_sale_id;
$$;

-- rpc_confirm_sale now returns the full receipt as jsonb instead of just the
-- sale id. The public confirmation page has no read access to raffle_sales
-- (and shouldn't — sale rows aren't public data), so everything the buyer
-- needs to see is handed back directly from the RPC that created the sale.
drop function if exists public.rpc_confirm_sale(
  uuid, uuid, text, text, text, text, text, uuid, uuid, text, uuid
);

create or replace function public.rpc_confirm_sale(
  p_raffle_id uuid,
  p_reservation_token uuid,
  p_buyer_full_name text,
  p_buyer_phone text,
  p_buyer_whatsapp text,
  p_buyer_instagram text,
  p_buyer_notes text,
  p_payment_method_id uuid,
  p_idempotency_key uuid,
  p_client_identifier text default null,
  p_attachment_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_sale_id uuid;
  v_raffle public.raffles%rowtype;
  v_point_ids uuid[];
  v_point_numbers integer[];
  v_point_count integer;
  v_amount_cents bigint;
  v_buyer_id uuid;
  v_buyer_name text;
  v_sale_id uuid;
  v_normalized_phone text;
  v_payment_method_name text;
  v_created_at timestamptz;
begin
  select id into v_existing_sale_id from public.raffle_sales where idempotency_key = p_idempotency_key;
  if found then
    return public.rpc_get_sale_receipt(v_existing_sale_id);
  end if;

  perform public.check_rate_limit(
    'confirm_sale',
    coalesce(p_client_identifier, p_reservation_token::text),
    10,
    60
  );

  perform public.rpc_release_expired_reservations();

  select * into v_raffle from public.raffles where id = p_raffle_id for share;
  if not found then
    raise exception 'Rifa não encontrada.';
  end if;
  if v_raffle.status <> 'OPEN' then
    raise exception 'Esta rifa já foi encerrada.';
  end if;

  if p_buyer_full_name is null or length(trim(p_buyer_full_name)) < 3 then
    raise exception 'Informe o nome completo do comprador.';
  end if;
  if p_buyer_phone is null or length(regexp_replace(p_buyer_phone, '\D', '', 'g')) < 8 then
    raise exception 'Informe um telefone válido.';
  end if;

  select name into v_payment_method_name
  from public.payment_methods
  where id = p_payment_method_id and active = true;
  if v_payment_method_name is null then
    raise exception 'Forma de pagamento inválida.';
  end if;

  with locked_points as (
    select id, point_number
    from public.raffle_points
    where raffle_id = p_raffle_id
      and reservation_token = p_reservation_token
      and status = 'RESERVED'
      and reserved_until > now()
    for update
  )
  select array_agg(id), array_agg(point_number order by point_number)
    into v_point_ids, v_point_numbers
  from locked_points;

  v_point_count := coalesce(array_length(v_point_ids, 1), 0);
  if v_point_count = 0 then
    select id into v_existing_sale_id from public.raffle_sales where idempotency_key = p_idempotency_key;
    if found then
      return public.rpc_get_sale_receipt(v_existing_sale_id);
    end if;
    raise exception 'Esta reserva expirou. Selecione os números novamente.';
  end if;

  v_amount_cents := v_point_count * v_raffle.unit_price_cents;
  v_normalized_phone := regexp_replace(p_buyer_phone, '\D', '', 'g');

  select id into v_buyer_id
  from public.buyers
  where regexp_replace(phone, '\D', '', 'g') = v_normalized_phone
    and lower(full_name) = lower(trim(p_buyer_full_name))
  limit 1;

  if v_buyer_id is null then
    insert into public.buyers (full_name, phone, whatsapp, instagram, notes)
    values (trim(p_buyer_full_name), p_buyer_phone, p_buyer_whatsapp, p_buyer_instagram, p_buyer_notes)
    returning id into v_buyer_id;
  end if;
  v_buyer_name := trim(p_buyer_full_name);

  insert into public.raffle_sales (
    raffle_id, buyer_id, seller_id, payment_method_id, amount_cents, idempotency_key
  )
  values (
    p_raffle_id, v_buyer_id, auth.uid(), p_payment_method_id, v_amount_cents, p_idempotency_key
  )
  on conflict (idempotency_key) do nothing
  returning id, created_at into v_sale_id, v_created_at;

  if v_sale_id is null then
    select id into v_sale_id from public.raffle_sales where idempotency_key = p_idempotency_key;
    return public.rpc_get_sale_receipt(v_sale_id);
  end if;

  insert into public.raffle_sale_points (sale_id, point_id)
  select v_sale_id, unnest(v_point_ids);

  update public.raffle_points
  set status = 'SOLD', reserved_until = null, reservation_token = null
  where id = any (v_point_ids);

  insert into public.payment_records (sale_id, payment_method_id, amount_cents)
  values (v_sale_id, p_payment_method_id, v_amount_cents);

  if p_attachment_id is not null then
    update public.attachments
    set entity_id = v_sale_id, status = 'UPLOADED'
    where id = p_attachment_id and entity_type = 'raffle_sale' and entity_id is null;
  end if;

  perform public.log_audit(
    'SALE_CONFIRMED',
    'raffle_sale',
    v_sale_id,
    null,
    jsonb_build_object(
      'raffle_id', p_raffle_id,
      'buyer_id', v_buyer_id,
      'seller_id', auth.uid(),
      'amount_cents', v_amount_cents,
      'point_count', v_point_count
    )
  );

  return jsonb_build_object(
    'saleId', v_sale_id,
    'raffleTitle', v_raffle.title,
    'buyerName', v_buyer_name,
    'pointNumbers', to_jsonb(v_point_numbers),
    'amountCents', v_amount_cents,
    'paymentMethod', v_payment_method_name,
    'createdAt', v_created_at
  );
end;
$$;

grant execute on function public.rpc_confirm_sale(
  uuid, uuid, text, text, text, text, text, uuid, uuid, text, uuid
) to anon, authenticated;


-- ==========================================
-- MIGRATION: 20260819091000_fix_cancel_sale_enum_cast.sql
-- ==========================================

-- Postgres didn't infer the CASE expression's result as point_status in this
-- context, and raised "column status is of type point_status but expression
-- is of type text". Cast explicitly instead of relying on inference.
create or replace function public.rpc_cancel_sale(
  p_sale_id uuid,
  p_reason text,
  p_return_to_available boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.raffle_sales%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem cancelar uma venda.';
  end if;

  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'Informe o motivo do cancelamento.';
  end if;

  select * into v_sale from public.raffle_sales where id = p_sale_id for update;
  if not found then
    raise exception 'Venda não encontrada.';
  end if;
  if v_sale.status = 'CANCELLED' then
    raise exception 'Esta venda já foi cancelada.';
  end if;

  update public.raffle_sales
  set status = 'CANCELLED', cancelled_reason = p_reason, cancelled_by = auth.uid(), cancelled_at = now()
  where id = p_sale_id;

  update public.raffle_points
  set status = (case when p_return_to_available then 'AVAILABLE' else 'CANCELLED' end)::public.point_status,
      reserved_until = null,
      reservation_token = null
  where id in (select point_id from public.raffle_sale_points where sale_id = p_sale_id);

  perform public.log_audit(
    'SALE_CANCELLED',
    'raffle_sale',
    p_sale_id,
    to_jsonb(v_sale),
    jsonb_build_object('reason', p_reason, 'return_to_available', p_return_to_available)
  );
end;
$$;


-- ==========================================
-- MIGRATION: 20260819092000_fix_null_boolean_authz_bypass.sql
-- ==========================================

-- CRITICAL FIX: public.is_admin() / public.is_vendedor_or_admin() compared
-- auth_role() (nullable — NULL for anonymous/unauthenticated callers) against
-- an enum literal with `=`, which yields SQL NULL rather than false when
-- auth_role() is NULL. RLS policies treat a NULL USING clause as deny, so
-- table access was never affected — but PL/pgSQL's `IF NOT is_admin() THEN
-- RAISE EXCEPTION ... END IF` treats a NULL condition as "not true, skip the
-- branch", which let anonymous callers fall through admin-only checks.
-- Confirmed exploitable: an anonymous call to rpc_cancel_sale actually
-- cancelled a sale. Fix: never return anything but a real boolean.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.auth_role() = 'ADMIN', false);
$$;

create or replace function public.is_vendedor_or_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.auth_role() in ('ADMIN', 'VENDEDOR'), false);
$$;


-- ==========================================
-- MIGRATION: 20260819093000_audit_logs_user_set_null_on_delete.sql
-- ==========================================

-- The audit trail should outlive the account that produced it — deleting a
-- user (e.g. GDPR-style erasure, or cleaning up a throwaway test account)
-- must not be blocked by their historical audit_logs rows, nor should those
-- rows disappear. Keep the log, null out the reference.
alter table public.audit_logs
  drop constraint audit_logs_user_id_fkey,
  add constraint audit_logs_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete set null;


-- ==========================================
-- MIGRATION: 20260819100000_financial_delete_rpc.sql
-- ==========================================

-- Soft-delete with a mandatory reason, same pattern as edits: sets the
-- session-local reason the audit trigger requires, then flips deleted_at.
-- Never a hard DELETE — financial history must stay reconstructable.
create or replace function public.rpc_delete_financial_transaction(
  p_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem excluir lançamentos financeiros.';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'Informe o motivo da exclusão.';
  end if;

  perform set_config('app.financial_edit_reason', p_reason, true);

  update public.financial_transactions
  set deleted_at = now()
  where id = p_id and deleted_at is null;

  if not found then
    raise exception 'Lançamento não encontrado ou já excluído.';
  end if;
end;
$$;

grant execute on function public.rpc_delete_financial_transaction(uuid, text) to authenticated;