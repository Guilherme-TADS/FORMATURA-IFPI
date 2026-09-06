-- Postgres didn't infer the CASE expression's result as point_status in this
-- context, and raised "column status is of type point_status but expression
-- is of type text". Cast explicitly instead of relying on inference.
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
  set status = (case when p_return_to_available then 'AVAILABLE' else 'CANCELLED' end)::public.point_status,
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
