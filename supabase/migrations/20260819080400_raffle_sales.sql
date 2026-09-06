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
