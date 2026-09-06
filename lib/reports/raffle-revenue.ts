import "server-only";
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type RaffleRevenueSummary = {
  totalCents: number;
  monthCents: number;
};

// Raffle sale revenue (raffle_sales.amount_cents) and the Financeiro ledger
// (financial_transactions) are deliberately separate: a confirmed sale isn't
// necessarily money already in the treasury yet — cash sales in particular
// only become real income once someone deposits/logs them. Because of that,
// this is reported as its own figure everywhere it's shown (dashboard,
// financeiro overview), never folded into "Saldo" — merging the two would
// double-count the moment someone logs a manual "Rifa" category income
// transaction for money that was already summed in here automatically.
export async function getRaffleRevenueSummary(
  supabase: SupabaseServerClient,
): Promise<RaffleRevenueSummary> {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01T00:00:00`;

  const { data } = await supabase
    .from("raffle_sales")
    .select("amount_cents, created_at")
    .eq("status", "CONFIRMED");

  let totalCents = 0;
  let monthCents = 0;
  for (const sale of data ?? []) {
    totalCents += sale.amount_cents;
    if (sale.created_at >= monthStart) monthCents += sale.amount_cents;
  }

  return { totalCents, monthCents };
}
