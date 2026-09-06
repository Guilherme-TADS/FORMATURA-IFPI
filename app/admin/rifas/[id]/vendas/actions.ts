"use server";

import { revalidatePath, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, active")
    .eq("id", user.id)
    .single();

  if (!profile?.active || profile.role !== "ADMIN") {
    throw new Error("Apenas administradores podem gerenciar o status de vendas.");
  }

  return { supabase, userId: user.id };
}

export async function approveSale(raffleId: string, saleId: string) {
  try {
    const { supabase, userId } = await requireAdmin();

    const { data: sale, error: fetchError } = await supabase
      .from("raffle_sales")
      .select("id, status")
      .eq("id", saleId)
      .single();

    if (fetchError || !sale) return { error: "Venda não encontrada." };
    if (sale.status === "CANCELLED") return { error: "Uma venda cancelada não pode ser aprovada." };

    // Registra a aprovação na auditoria oficial
    const { error: auditError } = await supabase.from("audit_logs").insert({
      action: "SALE_APPROVED",
      entity_type: "raffle_sale",
      entity_id: saleId,
      user_id: userId,
      new_data: { approved_at: new Date().toISOString() },
    });

    if (auditError) {
      return { error: "Não foi possível registrar a aprovação da venda." };
    }

    updateTag("raffles");
    revalidatePath(`/admin/rifas/${raffleId}/vendas`);
    revalidatePath(`/admin/rifas/${raffleId}/numeros`);
    revalidatePath(`/admin/rifas/${raffleId}`);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro ao aprovar venda." };
  }
}

export async function cancelSale(raffleId: string, saleId: string, reason: string) {
  const trimmed = reason.trim();
  if (trimmed.length < 3) {
    return { error: "Informe um motivo válido para o cancelamento (mínimo 3 caracteres)." };
  }

  try {
    const { supabase } = await requireAdmin();

    const { error } = await supabase.rpc("rpc_cancel_sale", {
      p_sale_id: saleId,
      p_reason: trimmed,
    });

    if (error) {
      return { error: error.message };
    }

    updateTag("raffles");
    revalidatePath(`/admin/rifas/${raffleId}/vendas`);
    revalidatePath(`/admin/rifas/${raffleId}/numeros`);
    revalidatePath(`/admin/rifas/${raffleId}`);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro ao cancelar venda." };
  }
}

export async function getAttachmentViewUrl(attachmentId: string): Promise<{ url?: string; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Não autenticado." };

    const { data: attachment } = await supabase
      .from("attachments")
      .select("temp_storage_path, drive_url")
      .eq("id", attachmentId)
      .single();

    if (!attachment) return { error: "Comprovante não encontrado." };
    if (attachment.drive_url) return { url: attachment.drive_url };
    if (!attachment.temp_storage_path) return { error: "Arquivo indisponível." };

    const { data, error } = await supabase.storage
      .from("attachments")
      .createSignedUrl(attachment.temp_storage_path, 300); // 5 minutos de validade

    if (error || !data) return { error: "Não foi possível gerar link do comprovante." };
    return { url: data.signedUrl };
  } catch {
    return { error: "Erro ao carregar comprovante." };
  }
}
