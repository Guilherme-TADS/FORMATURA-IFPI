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
