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
