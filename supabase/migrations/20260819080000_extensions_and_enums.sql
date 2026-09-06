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
