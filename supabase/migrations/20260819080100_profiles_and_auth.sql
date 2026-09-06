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
