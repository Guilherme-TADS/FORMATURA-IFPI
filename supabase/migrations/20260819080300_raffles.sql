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
