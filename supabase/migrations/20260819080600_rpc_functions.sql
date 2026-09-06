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
