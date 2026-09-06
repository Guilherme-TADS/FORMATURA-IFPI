"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type Role = Database["public"]["Enums"]["user_role"];

export type UserActionState = { error?: string };

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

const ROLES: Role[] = ["ADMIN", "VENDEDOR", "VISUALIZADOR"];

const NOT_ADMIN_MESSAGE = "Apenas administradores podem gerenciar usuários.";

export async function inviteUser(
  email: string,
  fullName: string,
  role: Role,
): Promise<UserActionState> {
  const trimmedEmail = email.trim().toLowerCase();
  const trimmedName = fullName.trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return { error: "Informe um e-mail válido." };
  }
  if (trimmedName.length < 2) {
    return { error: "Informe o nome completo." };
  }
  if (!ROLES.includes(role)) {
    return { error: "Papel inválido." };
  }

  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof Error && err.message === "not authorized") {
      return { error: "Apenas administradores podem convidar usuários." };
    }
    throw err;
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(trimmedEmail, {
    data: { full_name: trimmedName, role },
  });

  if (error) {
    if (error.message.toLowerCase().includes("already been registered")) {
      return { error: "Já existe um usuário com esse e-mail." };
    }
    return { error: "Não foi possível enviar o convite: " + error.message };
  }

  revalidatePath("/admin/usuarios");
  return {};
}

export async function updateUserRole(targetUserId: string, role: Role): Promise<UserActionState> {
  if (!ROLES.includes(role)) return { error: "Papel inválido." };

  try {
    const { supabase, userId } = await requireAdmin();
    if (targetUserId === userId) {
      return { error: "Você não pode alterar seu próprio papel." };
    }

    const { error } = await supabase.from("profiles").update({ role }).eq("id", targetUserId);
    if (error) return { error: "Não foi possível atualizar o papel." };

    revalidatePath("/admin/usuarios");
    return {};
  } catch (err) {
    if (err instanceof Error && err.message === "not authorized") {
      return { error: NOT_ADMIN_MESSAGE };
    }
    throw err;
  }
}

export async function toggleUserActive(
  targetUserId: string,
  active: boolean,
): Promise<UserActionState> {
  try {
    const { supabase, userId } = await requireAdmin();
    if (targetUserId === userId) {
      return { error: "Você não pode desativar sua própria conta." };
    }

    const { error } = await supabase.from("profiles").update({ active }).eq("id", targetUserId);
    if (error) return { error: "Não foi possível atualizar o status." };

    revalidatePath("/admin/usuarios");
    return {};
  } catch (err) {
    if (err instanceof Error && err.message === "not authorized") {
      return { error: NOT_ADMIN_MESSAGE };
    }
    throw err;
  }
}

export async function deleteUser(targetUserId: string): Promise<UserActionState> {
  try {
    const { supabase, userId } = await requireAdmin();
    if (targetUserId === userId) {
      return { error: "Você não pode excluir sua própria conta." };
    }

    // 1. Verifica se o usuário tem vendas registradas
    const { count: salesCount, error: salesError } = await supabase
      .from("raffle_sales")
      .select("id", { count: "exact", head: true })
      .or(`seller_id.eq.${targetUserId},cancelled_by.eq.${targetUserId}`);

    if (salesError) return { error: "Erro ao verificar histórico de vendas do usuário." };
    if (salesCount && salesCount > 0) {
      return {
        error:
          "Este usuário possui vendas ou cancelamentos registrados e não pode ser excluído. Para revogar o acesso, desative a conta do usuário.",
      };
    }

    // 2. Verifica se o usuário criou movimentações financeiras
    const { count: txCount, error: txError } = await supabase
      .from("financial_transactions")
      .select("id", { count: "exact", head: true })
      .or(`responsible_id.eq.${targetUserId},created_by.eq.${targetUserId}`);

    if (txError) return { error: "Erro ao verificar movimentações do usuário." };
    if (txCount && txCount > 0) {
      return {
        error:
          "Este usuário possui movimentações financeiras associadas e não pode ser excluído. Desative a conta do usuário para bloquear o acesso.",
      };
    }

    // 3. Verifica se criou rifas
    const { count: rafflesCount, error: rafflesError } = await supabase
      .from("raffles")
      .select("id", { count: "exact", head: true })
      .eq("created_by", targetUserId);

    if (rafflesError) return { error: "Erro ao verificar rifas criadas pelo usuário." };
    if (rafflesCount && rafflesCount > 0) {
      return {
        error:
          "Este usuário é criador de rifas cadastradas no sistema e não pode ser excluído. Desative a conta para bloquear o acesso.",
      };
    }

    // 4. Busca dados do perfil antes de deletar para auditoria
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", targetUserId)
      .single();

    // 5. Exclui o usuário no Supabase Auth usando o Admin Client (cascade para profiles)
    const admin = createAdminClient();
    const { error: authError } = await admin.auth.admin.deleteUser(targetUserId);
    if (authError) {
      return { error: "Não foi possível excluir o usuário: " + authError.message };
    }

    // 6. Registra no log de auditoria
    await supabase.from("audit_logs").insert({
      action: "USER_DELETED",
      entity_type: "user",
      entity_id: targetUserId,
      user_id: userId,
      old_data: profile ?? { id: targetUserId },
    });

    revalidatePath("/admin/usuarios");
    return {};
  } catch (err) {
    if (err instanceof Error && err.message === "not authorized") {
      return { error: NOT_ADMIN_MESSAGE };
    }
    throw err;
  }
}

