import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { centsToBRL } from "@/lib/money";
import { TransactionForm } from "../transaction-form";
import { TransactionRow } from "../transaction-row";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = { title: "Receitas" };

export default async function IncomePage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const isAdmin = profile?.role === "ADMIN";

  const [{ data: categories }, { data: paymentMethods }, { data: transactions }] =
    await Promise.all([
      supabase
        .from("financial_categories")
        .select("id, name")
        .eq("kind", "INCOME")
        .eq("active", true)
        .order("name"),
      supabase.from("payment_methods").select("id, name").eq("active", true).order("name"),
      supabase
        .from("financial_transactions")
        .select("id, description, amount_cents, occurred_on, financial_categories(id, name)")
        .eq("type", "INCOME")
        .is("deleted_at", null)
        .order("occurred_on", { ascending: false })
        .limit(100),
    ]);

  const total = (transactions ?? []).reduce((s, t) => s + t.amount_cents, 0);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Receitas</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        Total (últimos 100 lançamentos): {centsToBRL(total)}
      </p>

      {isAdmin ? (
        <div className="mb-8">
          <TransactionForm
            type="INCOME"
            categories={categories ?? []}
            paymentMethods={paymentMethods ?? []}
          />
        </div>
      ) : null}

      {!transactions || transactions.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhuma receita registrada.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-border border-b border-dashed text-left">
                <th className="label-tag py-2 pr-4">Descrição</th>
                <th className="label-tag py-2 pr-4">Categoria</th>
                <th className="label-tag py-2 pr-4">Valor</th>
                <th className="label-tag py-2 pr-4">Data</th>
                {isAdmin ? <th className="label-tag py-2 pr-4">Ações</th> : null}
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) =>
                isAdmin ? (
                  <TransactionRow
                    key={t.id}
                    id={t.id}
                    description={t.description}
                    categoryId={t.financial_categories?.id ?? null}
                    categoryName={t.financial_categories?.name ?? null}
                    amountCents={t.amount_cents}
                    occurredOn={t.occurred_on}
                    categories={categories ?? []}
                  />
                ) : (
                  <tr key={t.id} className="border-border border-b border-dashed last:border-0">
                    <td className="py-2.5 pr-4">{t.description}</td>
                    <td className="py-2.5 pr-4">{t.financial_categories?.name ?? "—"}</td>
                    <td className="font-figures py-2.5 pr-4">{centsToBRL(t.amount_cents)}</td>
                    <td className="font-figures py-2.5 pr-4">
                      {new Date(t.occurred_on + "T00:00:00").toLocaleDateString("pt-BR")}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
