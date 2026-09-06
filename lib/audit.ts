// Labels for the values written by public.log_audit() across the RPCs (see
// supabase/migrations/20260819080600_rpc_functions.sql and
// 20260819080500_financial_transactions.sql). Kept in one place so the
// dashboard's "atividade recente" and /admin/auditoria stay in sync.
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  RESERVE: "Números reservados",
  SALE_CONFIRMED: "Venda confirmada",
  SALE_CANCELLED: "Venda cancelada",
  RAFFLE_CLOSED: "Rifa encerrada",
  RAFFLE_CANCELLED: "Rifa cancelada",
  FINANCIAL_TRANSACTION_CREATED: "Lançamento criado",
  FINANCIAL_TRANSACTION_UPDATED: "Lançamento alterado",
};

export const AUDIT_ENTITY_TYPE_LABELS: Record<string, string> = {
  raffle_point: "Número da rifa",
  raffle_sale: "Venda",
  raffle: "Rifa",
  financial_transaction: "Lançamento financeiro",
};
