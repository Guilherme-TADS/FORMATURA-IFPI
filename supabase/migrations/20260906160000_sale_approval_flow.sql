-- Fluxo de Aprovação de Vendas: Suporte ao status PENDING e RPC de aprovação

-- 1. Adiciona PENDING ao enum sale_status
alter type public.sale_status add value if not exists 'PENDING';

-- 2. Atualiza a função rpc_get_sale_receipt para incluir o status atual da venda
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
    'status', s.status,
    'createdAt', s.created_at
  )
  from public.raffle_sales s
  join public.raffles r on r.id = s.raffle_id
  join public.buyers b on b.id = s.buyer_id
  join public.payment_methods pm on pm.id = s.payment_method_id
  where s.id = p_sale_id;
$$;

-- 3. Atualiza rpc_confirm_sale para definir PENDING para autoatendimento e CONFIRMED para vendas assistidas
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
  v_initial_status public.sale_status;
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

  -- Se for registrado por membro logado (venda assistida), confirma na hora.
  -- Se for autoatendimento online pelo site público, fica PENDING aguardando conferência do comprovante.
  if auth.uid() is not null then
    v_initial_status := 'CONFIRMED'::public.sale_status;
  else
    v_initial_status := 'PENDING'::public.sale_status;
  end if;

  insert into public.raffle_sales (
    raffle_id, buyer_id, seller_id, payment_method_id, amount_cents, status, idempotency_key
  )
  values (
    p_raffle_id, v_buyer_id, auth.uid(), p_payment_method_id, v_amount_cents, v_initial_status, p_idempotency_key
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
      'point_count', v_point_count,
      'status', v_initial_status
    )
  );

  return jsonb_build_object(
    'saleId', v_sale_id,
    'raffleTitle', v_raffle.title,
    'buyerName', v_buyer_name,
    'pointNumbers', to_jsonb(v_point_numbers),
    'amountCents', v_amount_cents,
    'paymentMethod', v_payment_method_name,
    'status', v_initial_status,
    'createdAt', v_created_at
  );
end;
$$;

-- 4. Função rpc_approve_sale para aprovar vendas pendentes
create or replace function public.rpc_approve_sale(
  p_sale_id uuid
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
    raise exception 'Apenas administradores podem aprovar uma venda.';
  end if;

  select * into v_sale from public.raffle_sales where id = p_sale_id for update;
  if not found then
    raise exception 'Venda não encontrada.';
  end if;
  if v_sale.status = 'CANCELLED' then
    raise exception 'Uma venda cancelada não pode ser aprovada.';
  end if;
  if v_sale.status = 'CONFIRMED' then
    return;
  end if;

  update public.raffle_sales
  set status = 'CONFIRMED'
  where id = p_sale_id;

  perform public.log_audit(
    'SALE_APPROVED',
    'raffle_sale',
    p_sale_id,
    to_jsonb(v_sale),
    jsonb_build_object('approved_by', auth.uid())
  );
end;
$$;

grant execute on function public.rpc_approve_sale(uuid) to authenticated;
