"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { brlStringToCents } from "@/lib/money";
import {
  transactionFormSchema,
  editTransactionSchema,
  type TransactionFormValues,
  type EditTransactionValues,
} from "@/lib/schemas/financial";

export type FinancialActionState = { error?: string };

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, active")
    .eq("id", user.id)
    .single();
  if (!profile?.active || profile.role !== "ADMIN") {
    throw new Error("not authorized");
  }
  return { supabase, userId: user.id };
}

export async function createTransaction(
  type: "INCOME" | "EXPENSE",
  values: TransactionFormValues,
): Promise<FinancialActionState> {
  const parsed = transactionFormSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const amountCents = brlStringToCents(parsed.data.amountLabel);
  if (amountCents === null || amountCents <= 0) {
    return { error: "Valor inválido." };
  }

  try {
    const { supabase, userId } = await requireAdmin();

    let supplierId: string | null = null;
    if (type === "EXPENSE" && parsed.data.supplierName) {
      const name = parsed.data.supplierName.trim();
      const { data: existing } = await supabase
        .from("suppliers")
        .select("id")
        .ilike("name", name)
        .maybeSingle();
      if (existing) {
        supplierId = existing.id;
      } else {
        const { data: created, error: supplierError } = await supabase
          .from("suppliers")
          .insert({ name })
          .select("id")
          .single();
        if (supplierError) return { error: "Não foi possível salvar o fornecedor." };
        supplierId = created.id;
      }
    }

    const { error } = await supabase.from("financial_transactions").insert({
      type,
      description: parsed.data.description,
      category_id: parsed.data.categoryId,
      supplier_id: supplierId,
      amount_cents: amountCents,
      occurred_on: parsed.data.occurredOn,
      responsible_id: userId,
      payment_method_id: parsed.data.paymentMethodId || null,
      origin: parsed.data.origin || null,
      notes: parsed.data.notes || null,
      created_by: userId,
    });

    if (error) return { error: "Não foi possível salvar o lançamento." };

    revalidatePath("/admin/financeiro");
    revalidatePath(
      type === "INCOME" ? "/admin/financeiro/receitas" : "/admin/financeiro/despesas",
    );
    return {};
  } catch (err) {
    if (err instanceof Error && err.message === "not authorized") {
      return { error: "Apenas administradores podem lançar movimentações financeiras." };
    }
    throw err;
  }
}

export async function updateTransaction(
  id: string,
  values: EditTransactionValues,
): Promise<FinancialActionState> {
  const parsed = editTransactionSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const amountCents = brlStringToCents(parsed.data.amountLabel);
  if (amountCents === null || amountCents <= 0) {
    return { error: "Valor inválido." };
  }

  try {
    const { supabase } = await requireAdmin();
    const { error } = await supabase.rpc("rpc_update_financial_transaction", {
      p_id: id,
      p_description: parsed.data.description,
      p_category_id: parsed.data.categoryId,
      p_amount_cents: amountCents,
      p_occurred_on: parsed.data.occurredOn,
      p_reason: parsed.data.reason,
    });
    if (error) return { error: error.message };

    revalidatePath("/admin/financeiro");
    revalidatePath("/admin/financeiro/receitas");
    revalidatePath("/admin/financeiro/despesas");
    return {};
  } catch (err) {
    if (err instanceof Error && err.message === "not authorized") {
      return { error: "Apenas administradores podem editar lançamentos." };
    }
    throw err;
  }
}

export async function deleteTransaction(id: string, reason: string) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("rpc_delete_financial_transaction", {
    p_id: id,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/financeiro");
  revalidatePath("/admin/financeiro/receitas");
  revalidatePath("/admin/financeiro/despesas");
}

export async function createCategory(kind: "INCOME" | "EXPENSE", name: string) {
  const { supabase } = await requireAdmin();
  if (name.trim().length < 2) throw new Error("Nome da categoria muito curto.");
  const { error } = await supabase
    .from("financial_categories")
    .insert({ kind, name: name.trim() });
  if (error) {
    if (error.code === "23505") throw new Error("Essa categoria já existe.");
    throw new Error("Não foi possível criar a categoria.");
  }
  revalidatePath("/admin/financeiro/categorias");
}

export async function deleteCategory(id: string) {
  const { supabase } = await requireAdmin();

  // Verifica se há lançamentos vinculados a esta categoria
  const { count, error: countError } = await supabase
    .from("financial_transactions")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id);

  if (countError) throw new Error("Erro ao verificar lançamentos da categoria.");
  if (count && count > 0) {
    throw new Error(
      `Esta categoria possui ${count} lançamento(s) vinculado(s) e não pode ser excluída. Desative-a para ocultá-la de novos lançamentos.`
    );
  }

  const { error } = await supabase
    .from("financial_categories")
    .delete()
    .eq("id", id);

  if (error) throw new Error("Não foi possível excluir a categoria.");

  revalidatePath("/admin/financeiro/categorias");
  revalidatePath("/admin/financeiro/receitas");
  revalidatePath("/admin/financeiro/despesas");
}

export async function toggleCategoryActive(id: string, active: boolean) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("financial_categories")
    .update({ active })
    .eq("id", id);

  if (error) throw new Error("Não foi possível atualizar o status da categoria.");

  revalidatePath("/admin/financeiro/categorias");
  revalidatePath("/admin/financeiro/receitas");
  revalidatePath("/admin/financeiro/despesas");
}

export async function updateCategory(id: string, name: string) {
  const { supabase } = await requireAdmin();
  const trimmed = name.trim();
  if (trimmed.length < 2) throw new Error("Nome da categoria muito curto.");

  const { error } = await supabase
    .from("financial_categories")
    .update({ name: trimmed })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      throw new Error("Já existe uma categoria com esse nome neste tipo.");
    }
    throw new Error("Não foi possível renomear a categoria.");
  }

  revalidatePath("/admin/financeiro/categorias");
  revalidatePath("/admin/financeiro/receitas");
  revalidatePath("/admin/financeiro/despesas");
}


