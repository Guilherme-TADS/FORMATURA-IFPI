"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { DocumentEntityType } from "@/lib/uploads";

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

export async function getDownloadUrl(
  attachmentId: string,
): Promise<{ url?: string; error?: string }> {
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

  if (!attachment) return { error: "Documento não encontrado." };
  if (attachment.drive_url) return { url: attachment.drive_url };
  if (!attachment.temp_storage_path) return { error: "Arquivo indisponível." };

  const { data, error } = await supabase.storage
    .from("attachments")
    .createSignedUrl(attachment.temp_storage_path, 60);

  if (error || !data) return { error: "Não foi possível gerar o link de download." };
  return { url: data.signedUrl };
}

export async function linkAttachment(
  attachmentId: string,
  entityType: DocumentEntityType | "document",
  entityId: string | null,
) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("attachments")
    .update({ entity_type: entityType, entity_id: entityType === "document" ? null : entityId })
    .eq("id", attachmentId);
  if (error) throw new Error("Não foi possível vincular o documento.");
  revalidatePath("/admin/documentos");
}

export async function updateAttachmentDescription(attachmentId: string, description: string) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("attachments")
    .update({ description: description.trim() || null })
    .eq("id", attachmentId);
  if (error) throw new Error("Não foi possível atualizar a descrição.");
  revalidatePath("/admin/documentos");
}

export async function deleteAttachment(attachmentId: string, reason: string) {
  const trimmedReason = reason.trim();
  if (!trimmedReason || trimmedReason.length < 5) {
    throw new Error("Informe um motivo válido para a exclusão (mínimo de 5 caracteres).");
  }

  const { supabase, userId } = await requireAdmin();

  const { data: attachment, error: fetchError } = await supabase
    .from("attachments")
    .select("*")
    .eq("id", attachmentId)
    .single();

  if (fetchError || !attachment) {
    throw new Error("Documento não encontrado.");
  }

  // Se houver arquivo no Storage local, remove-o
  if (attachment.temp_storage_path) {
    await supabase.storage.from("attachments").remove([attachment.temp_storage_path]);
  }

  // Registra a auditoria
  await supabase.from("audit_logs").insert({
    action: "ATTACHMENT_DELETED",
    entity_type: "attachment",
    entity_id: attachmentId,
    user_id: userId,
    old_data: attachment,
    metadata: {
      reason: trimmedReason,
      deleted_file_name: attachment.file_name,
      storage_path: attachment.temp_storage_path,
    },
  });

  // Remove a linha da tabela
  const { error: deleteError } = await supabase
    .from("attachments")
    .delete()
    .eq("id", attachmentId);

  if (deleteError) {
    throw new Error("Não foi possível excluir o registro do documento.");
  }

  revalidatePath("/admin/documentos");
  revalidatePath("/admin/auditoria");
  revalidatePath("/admin/dashboard");
}
