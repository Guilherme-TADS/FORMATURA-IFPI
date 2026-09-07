import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { centsToBRL } from "@/lib/money";
import { LinkButton } from "@/components/ui/link-button";
import { AUDIT_ACTION_LABELS } from "@/lib/audit";
import { getRaffleRevenueSummary } from "@/lib/reports/raffle-revenue";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = { title: "Painel" };

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const canSeeFinancials = profile.role === "ADMIN" || profile.role === "VISUALIZADOR";
  const isAdmin = profile.role === "ADMIN";
  const supabase = await createClient();

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  // Every query below is independent of the others' results, so they all go
  // in one Promise.all — one network round trip instead of up to four
  // sequential ones. That's the difference between ~1.2s and ~300ms on a
  // deployment where the app server and Supabase aren't in the same region.
  const [
    { count: activeRaffles },
    { data: recentSales },
    raffleRevenue,
    { data: transactions },
    { data: expenses },
    { data: activity },
    { data: unapprovedSales },
  ] = await Promise.all([
    supabase.from("raffles").select("id", { count: "exact", head: true }).eq("status", "OPEN"),
    supabase
      .from("raffle_sales")
      .select("id, amount_cents, created_at, raffles(title), buyers(full_name)")
      .eq("status", "CONFIRMED")
      .order("created_at", { ascending: false })
      .limit(6),
    getRaffleRevenueSummary(supabase),
    canSeeFinancials
      ? supabase
          .from("financial_transactions")
          .select("type, amount_cents, occurred_on")
          .is("deleted_at", null)
      : Promise.resolve({ data: null }),
    canSeeFinancials
      ? supabase
          .from("financial_transactions")
          .select("id, description, amount_cents, occurred_on")
          .eq("type", "EXPENSE")
          .is("deleted_at", null)
          .order("occurred_on", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: null }),
    isAdmin
      ? supabase
          .from("audit_logs")
          .select("id, action, entity_type, created_at, profiles(full_name)")
          .order("created_at", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: null }),
    supabase
      .from("raffle_sales")
      .select("id")
      .eq("status", "CONFIRMED")
      .is("seller_id", null),
  ]);

  const selfServiceSaleIds = (unapprovedSales ?? []).map((s) => s.id);
  const { data: approvedLogs } =
    selfServiceSaleIds.length > 0
      ? await supabase
          .from("audit_logs")
          .select("entity_id")
          .eq("entity_type", "raffle_sale")
          .eq("action", "SALE_APPROVED")
          .in("entity_id", selfServiceSaleIds)
      : { data: [] };

  const approvedIds = new Set((approvedLogs ?? []).map((l) => l.entity_id));
  const pendingReviewCount = selfServiceSaleIds.filter((id) => !approvedIds.has(id)).length;

  let balanceCents = 0;
  let monthResultCents = 0;
  for (const t of transactions ?? []) {
    const signed = t.type === "INCOME" ? t.amount_cents : -t.amount_cents;
    balanceCents += signed;
    if (t.occurred_on >= monthStart) monthResultCents += signed;
  }
  const recentExpenses = expenses ?? [];
  const recentActivity = activity ?? [];

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">
        Olá, {profile.full_name.split(" ")[0]}
      </h1>
      <p className="text-muted-foreground mt-1 mb-6 text-sm">
        Resumo do que está acontecendo na comissão.
      </p>

      {pendingReviewCount > 0 && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-sm text-amber-800 dark:text-amber-300">
          <div className="flex items-center gap-2">
            <span className="text-base">⏳</span>
            <span>
              Existem <strong>{pendingReviewCount} {pendingReviewCount === 1 ? "venda de rifa pendente" : "vendas de rifa pendentes"}</strong> aguardando conferência do comprovante.
            </span>
          </div>
          <LinkButton
            variant="outline"
            size="sm"
            href="/admin/relatorios/vendas?status=PENDING"
            className="border-amber-500/40 bg-background text-amber-900 dark:text-amber-200"
          >
            Conferir pendências
          </LinkButton>
        </div>
      )}

      <div className="border-border bg-card ring-foreground/8 grid grid-cols-2 divide-x divide-y divide-dashed divide-border overflow-hidden rounded-lg border ring-1 sm:grid-cols-4 sm:divide-y-0">
        {canSeeFinancials ? (
          <>
            <div className="p-4">
              <p className="label-tag">Saldo</p>
              <p className="font-figures mt-1 text-xl font-semibold">
                {centsToBRL(balanceCents)}
              </p>
            </div>
            <div className="p-4">
              <p className="label-tag">Resultado do mês</p>
              <p
                className={
                  "font-figures mt-1 text-xl font-semibold " +
                  (monthResultCents < 0 ? "text-void" : "")
                }
              >
                {centsToBRL(monthResultCents)}
              </p>
            </div>
          </>
        ) : null}
        <div className="p-4">
          <p className="label-tag">Rifas ativas</p>
          <p className="font-figures mt-1 text-xl font-semibold">{activeRaffles ?? 0}</p>
        </div>
        <div className="p-4">
          <p className="label-tag">Vendas de rifas (mês)</p>
          <p className="font-figures mt-1 text-xl font-semibold">
            {centsToBRL(raffleRevenue.monthCents)}
          </p>
        </div>
      </div>
      <p className="text-muted-foreground mt-3 mb-8 text-xs">
        Total histórico de rifas confirmadas: <strong>{centsToBRL(raffleRevenue.totalCents)}</strong>.
        Para conciliação contábil, os valores arrecadados entram no Saldo da turma quando o repasse
        é registrado em <span className="font-medium text-foreground">Financeiro › Receitas</span> (categoria &quot;Rifa&quot;).
      </p>

      <div className="mb-8 flex flex-wrap gap-2">
        <LinkButton variant="outline" size="sm" href="/admin/rifas">
          Ver rifas
        </LinkButton>
        {canSeeFinancials ? (
          <LinkButton variant="outline" size="sm" href="/admin/financeiro">
            Ver financeiro
          </LinkButton>
        ) : null}
        {canSeeFinancials ? (
          <LinkButton variant="outline" size="sm" href="/admin/relatorios/vendas">
            Relatório de vendas
          </LinkButton>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div>
          <h2 className="mb-1 font-medium">Vendas recentes</h2>
          {!recentSales || recentSales.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma venda registrada ainda.</p>
          ) : (
            <ul>
              {recentSales.map((sale) => (
                <li
                  key={sale.id}
                  className="receipt-divider flex items-center justify-between gap-3 py-2.5 text-sm first:border-t-0"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{sale.buyers?.full_name ?? "—"}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {sale.raffles?.title ?? "—"} ·{" "}
                      {new Date(sale.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <span className="font-figures shrink-0 font-medium">
                    {centsToBRL(sale.amount_cents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {canSeeFinancials ? (
          <div>
            <h2 className="mb-1 font-medium">Despesas recentes</h2>
            {recentExpenses.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma despesa registrada ainda.</p>
            ) : (
              <ul>
                {recentExpenses.map((exp) => (
                  <li
                    key={exp.id}
                    className="receipt-divider flex items-center justify-between gap-3 py-2.5 text-sm first:border-t-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{exp.description}</p>
                      <p className="text-muted-foreground text-xs">
                        {new Date(exp.occurred_on + "T00:00:00").toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <span className="font-figures shrink-0 font-medium">
                      {centsToBRL(exp.amount_cents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {isAdmin ? (
          <div className="lg:col-span-2">
            <h2 className="mb-1 font-medium">Atividade recente</h2>
            {recentActivity.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma atividade registrada ainda.</p>
            ) : (
              <ul>
                {recentActivity.map((a) => (
                  <li
                    key={a.id}
                    className="receipt-divider text-muted-foreground flex items-center justify-between py-2 text-sm first:border-t-0"
                  >
                    <span>
                      {AUDIT_ACTION_LABELS[a.action] ?? a.action}
                      {a.profiles?.full_name ? ` · ${a.profiles.full_name}` : ""}
                    </span>
                    <span className="font-figures text-xs">
                      {new Date(a.created_at).toLocaleString("pt-BR")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
