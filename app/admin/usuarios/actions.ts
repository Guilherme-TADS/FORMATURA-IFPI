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
