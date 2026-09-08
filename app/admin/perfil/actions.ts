"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ProfileActionState = {
  error?: string;
  success?: string;
};

export async function updateMyProfile(
  fullName: string,
  phone?: string,
): Promise<ProfileActionState> {
  const trimmedName = fullName.trim();
  if (trimmedName.length < 2) {
    return { error: "Nome deve ter pelo menos 2 caracteres." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Não autenticado." };

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: trimmedName,
      phone: phone ? phone.trim() : null,
    })
    .eq("id", user.id);

  if (error) {
    return { error: "Não foi possível salvar os dados do perfil." };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/perfil");
  return { success: "Perfil atualizado com sucesso!" };
}

export async function updateMyPassword(
  currentPassword: string,
  newPassword: string,
): Promise<ProfileActionState> {
  if (newPassword.length < 8) {
    return { error: "A nova senha deve ter pelo menos 8 caracteres." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) return { error: "Não autenticado." };

  // Valida a senha atual tentando autenticar
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (verifyError) {
    return { error: "Senha atual incorreta." };
  }

  // Atualiza para a nova senha
  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (updateError) {
    return { error: "Não foi possível atualizar a senha: " + updateError.message };
  }

  return { success: "Senha alterada com sucesso!" };
}
