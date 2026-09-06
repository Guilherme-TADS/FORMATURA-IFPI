-- Soft-delete with a mandatory reason, same pattern as edits: sets the
-- session-local reason the audit trigger requires, then flips deleted_at.
-- Never a hard DELETE — financial history must stay reconstructable.
create or replace function public.rpc_delete_financial_transaction(
  p_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem excluir lançamentos financeiros.';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'Informe o motivo da exclusão.';
  end if;

  perform set_config('app.financial_edit_reason', p_reason, true);

  update public.financial_transactions
  set deleted_at = now()
  where id = p_id and deleted_at is null;

  if not found then
    raise exception 'Lançamento não encontrado ou já excluído.';
  end if;
end;
$$;

grant execute on function public.rpc_delete_financial_transaction(uuid, text) to authenticated;
