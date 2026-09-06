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
