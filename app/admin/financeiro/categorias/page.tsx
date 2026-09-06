import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { CategoryForm } from "./category-form";
import { CategoryItem } from "./category-item";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = { title: "Categorias financeiras" };

export default async function CategoriesPage() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "ADMIN") {
    redirect("/admin/financeiro");
  }

  const supabase = await createClient();
  const { data: categories } = await supabase
    .from("financial_categories")
    .select("id, kind, name, active")
    .order("kind")
    .order("name");

  const income = (categories ?? []).filter((c) => c.kind === "INCOME");
  const expense = (categories ?? []).filter((c) => c.kind === "EXPENSE");

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        Categorias financeiras
      </h1>

      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
        <div>
          <h2 className="label-tag mb-3">Receitas</h2>
          <ul className="mb-4 flex flex-wrap gap-2">
            {income.map((c) => (
              <CategoryItem
                key={c.id}
                id={c.id}
                name={c.name}
                active={c.active}
              />
            ))}
          </ul>
          <CategoryForm kind="INCOME" />
        </div>
        <div>
          <h2 className="label-tag mb-3">Despesas</h2>
          <ul className="mb-4 flex flex-wrap gap-2">
            {expense.map((c) => (
              <CategoryItem
                key={c.id}
                id={c.id}
                name={c.name}
                active={c.active}
              />
            ))}
          </ul>
          <CategoryForm kind="EXPENSE" />
        </div>
      </div>
    </div>
  );
}
