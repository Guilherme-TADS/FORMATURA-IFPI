"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const buyerUpdateSchema = z.object({
  fullName: z.string().trim().min(2, "Nome deve ter pelo menos 2 caracteres."),
  phone: z.string().trim().min(8, "Telefone inválido."),
  whatsapp: z.string().trim().optional(),
  instagram: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export type BuyerUpdateValues = z.infer<typeof buyerUpdateSchema>;

async function requireActiveUser() {
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
  if (!profile?.active) {
    throw new Error("not authorized");
  }
  return { supabase, user, profile, isAdmin: profile.role === "ADMIN" };
}

export async function updateBuyer(id: string, values: BuyerUpdateValues) {
  const parsed = buyerUpdateSchema.safeParse(values);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }

  const { supabase, isAdmin } = await requireActiveUser();
  if (!isAdmin) {
    throw new Error("Apenas administradores podem alterar dados de compradores.");
  }

  const { error } = await supabase
    .from("buyers")
    .update({
      full_name: parsed.data.fullName,
      phone: parsed.data.phone,
      whatsapp: parsed.data.whatsapp || null,
      instagram: parsed.data.instagram || null,
      notes: parsed.data.notes || null,
    })
    .eq("id", id);

  if (error) {
    throw new Error("Não foi possível atualizar o comprador.");
  }

  revalidatePath("/admin/compradores");
}

export async function deleteBuyer(id: string) {
  const { supabase, user, isAdmin } = await requireActiveUser();
  if (!isAdmin) {
    throw new Error("Apenas administradores podem excluir compradores.");
  }

  // Verifica se há compras registradas vinculadas a este comprador
  const { count, error: countError } = await supabase
    .from("raffle_sales")
    .select("id", { count: "exact", head: true })
    .eq("buyer_id", id);

  if (countError) {
    throw new Error("Erro ao verificar compras do comprador.");
  }

  if (count && count > 0) {
    throw new Error(
      `Este comprador possui ${count} compra(s) registrada(s) no sistema e não pode ser excluído para preservar o histórico das rifas.`,
    );
  }

  // Busca dados antes da exclusão para auditoria
  const { data: buyer } = await supabase
    .from("buyers")
    .select("id, full_name, phone")
    .eq("id", id)
    .single();

  const { error: deleteError } = await supabase
    .from("buyers")
    .delete()
    .eq("id", id);

  if (deleteError) {
    throw new Error("Não foi possível excluir o comprador.");
  }

  await supabase.from("audit_logs").insert({
    action: "BUYER_DELETED",
    entity_type: "buyer",
    entity_id: id,
    user_id: user.id,
    old_data: buyer ?? { id },
  });

  revalidatePath("/admin/compradores");
}
