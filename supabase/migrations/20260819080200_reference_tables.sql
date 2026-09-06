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
