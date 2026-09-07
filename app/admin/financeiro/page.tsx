import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { LinkButton } from "@/components/ui/link-button";
import { centsToBRL } from "@/lib/money";
import { getRaffleRevenueSummary } from "@/lib/reports/raffle-revenue";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = { title: "Financeiro" };

export default async function FinancialOverviewPage() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "ADMIN" && profile?.role !== "VISUALIZADOR") {
    redirect("/admin/dashboard");
  }

  const supabase = await createClient();
  const [{ data: transactions }, raffleRevenue] = await Promise.all([
    supabase
      .from("financial_transactions")
      .select("type, amount_cents, occurred_on")
      .is("deleted_at", null),
    getRaffleRevenueSummary(supabase),
  ]);

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  let totalIncome = 0;
  let totalExpense = 0;
  let monthIncome = 0;
  let monthExpense = 0;

  for (const t of transactions ?? []) {
    const isThisMonth = t.occurred_on >= monthStart;
    if (t.type === "INCOME") {
      totalIncome += t.amount_cents;
      if (isThisMonth) monthIncome += t.amount_cents;
    } else {
      totalExpense += t.amount_cents;
      if (isThisMonth) monthExpense += t.amount_cents;
    }
  }

  const balance = totalIncome - totalExpense;
  const monthResult = monthIncome - monthExpense;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Financeiro</h1>
        <div className="flex gap-2">
          <LinkButton variant="outline" size="sm" href="/admin/financeiro/receitas">
            Receitas
          </LinkButton>
          <LinkButton variant="outline" size="sm" href="/admin/financeiro/despesas">
            Despesas
          </LinkButton>
          {profile.role === "ADMIN" ? (
            <LinkButton variant="outline" size="sm" href="/admin/financeiro/categorias">
              Categorias
            </LinkButton>
          ) : null}
        </div>
      </div>

      <div className="border-border bg-card ring-foreground/8 grid grid-cols-2 divide-x divide-y divide-dashed divide-border overflow-hidden rounded-lg border ring-1 sm:grid-cols-4 sm:divide-y-0">
        <div className="p-4">
          <p className="label-tag">Saldo</p>
          <p className="font-figures mt-1 text-xl font-semibold">{centsToBRL(balance)}</p>
        </div>
        <div className="p-4">
          <p className="label-tag">Receitas do mês</p>
          <p className="font-figures mt-1 text-xl font-semibold">{centsToBRL(monthIncome)}</p>
        </div>
        <div className="p-4">
          <p className="label-tag">Despesas do mês</p>
          <p className="font-figures mt-1 text-xl font-semibold">{centsToBRL(monthExpense)}</p>
        </div>
        <div className="p-4">
          <p className="label-tag">Resultado do mês</p>
          <p
            className={
              "font-figures mt-1 text-xl font-semibold " + (monthResult < 0 ? "text-void" : "")
            }
          >
            {centsToBRL(monthResult)}
          </p>
        </div>
      </div>

      <p className="text-muted-foreground mt-3 text-sm">
        Total de receitas: {centsToBRL(totalIncome)} · Total de despesas:{" "}
        {centsToBRL(totalExpense)}
      </p>

      <div className="border-border bg-secondary/50 mt-8 rounded-lg border border-dashed p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="label-tag">Arrecadação de rifas (mês)</p>
            <p className="font-figures mt-1 text-xl font-semibold">
              {centsToBRL(raffleRevenue.monthCents)}
            </p>
            <p className="text-muted-foreground mt-1.5 text-xs max-w-xl">
              Total histórico de rifas confirmadas: <strong>{centsToBRL(raffleRevenue.totalCents)}</strong>.
              Para conciliação contábil, os valores entram no Saldo geral quando a comissão confirma a entrada em{" "}
              <span className="font-medium text-foreground">Receitas</span> (categoria &quot;Rifa&quot;).
            </p>
          </div>
          {profile.role === "ADMIN" ? (
            <LinkButton variant="outline" size="sm" href="/admin/financeiro/receitas">
              Registrar Repasse em Receitas
            </LinkButton>
          ) : null}
        </div>
      </div>
    </div>
  );
}
