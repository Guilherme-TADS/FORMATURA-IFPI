"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { brlStringToCents } from "@/lib/money";
import { raffleFormSchema, type RaffleFormValues } from "@/lib/schemas/raffle";

export type RaffleActionState = {
  error?: string;
};

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

function toRow(values: RaffleFormValues) {
  const unitPriceCents = brlStringToCents(values.unitPriceLabel);
  if (unitPriceCents === null || unitPriceCents <= 0) {
    throw new Error("Valor do número inválido.");
  }
  return {
    title: values.title,
    slug: values.slug,
    description: values.description || null,
    rules: values.rules || null,
    image_url: values.imageUrl || null,
    total_points: values.totalPoints,
    unit_price_cents: unitPriceCents,
    starts_at: new Date(values.startsAt).toISOString(),
    ends_at: new Date(values.endsAt).toISOString(),
    google_sheet_url: values.googleSheetUrl || null,
    internal_notes: values.internalNotes || null,
  };
}

export async function createRaffle(
  values: RaffleFormValues,
): Promise<RaffleActionState> {
  const parsed = raffleFormSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    const { supabase, userId } = await requireAdmin();
    const row = toRow(parsed.data);

    const { data, error } = await supabase
      .from("raffles")
      .insert({ ...row, created_by: userId })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        return { error: "Já existe uma rifa com esse identificador (slug). Escolha outro." };
      }
      return { error: "Não foi possível criar a rifa. Tente novamente." };
    }

    updateTag("raffles");
    revalidatePath("/admin/rifas");
    redirect(`/admin/rifas/${data.id}`);
  } catch (err) {
    if (err instanceof Error && err.message === "not authorized") {
      return { error: "Apenas administradores podem criar rifas." };
    }
    throw err;
  }
}

export async function updateRaffle(
  raffleId: string,
  values: RaffleFormValues,
): Promise<RaffleActionState> {
  const parsed = raffleFormSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    const { supabase } = await requireAdmin();
    const row = toRow(parsed.data);
    // total_points is intentionally excluded: it cannot change after the
    // points have already been generated.
    const { total_points: _totalPoints, ...editableRow } = row;
    void _totalPoints;

    const { error } = await supabase
      .from("raffles")
      .update(editableRow)
      .eq("id", raffleId);

    if (error) {
      if (error.code === "23505") {
        return { error: "Já existe uma rifa com esse identificador (slug). Escolha outro." };
      }
      return { error: "Não foi possível salvar as alterações." };
    }

    updateTag("raffles");
    revalidatePath("/admin/rifas");
    revalidatePath(`/admin/rifas/${raffleId}`);
    redirect(`/admin/rifas/${raffleId}`);
  } catch (err) {
    if (err instanceof Error && err.message === "not authorized") {
      return { error: "Apenas administradores podem editar rifas." };
    }
    throw err;
  }
}

export async function closeRaffle(raffleId: string) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("rpc_close_raffle", {
    p_raffle_id: raffleId,
  });
  if (error) throw new Error(error.message);
  updateTag("raffles");
  revalidatePath(`/admin/rifas/${raffleId}`);
  revalidatePath("/admin/rifas");
}

export async function cancelRaffle(raffleId: string, reason: string) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("rpc_cancel_raffle", {
    p_raffle_id: raffleId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  updateTag("raffles");
  revalidatePath(`/admin/rifas/${raffleId}`);
  revalidatePath("/admin/rifas");
}

export async function deleteRaffle(raffleId: string) {
  const { supabase, userId } = await requireAdmin();

  // Verifica se há vendas registradas (mesmo canceladas)
  const { count, error: countError } = await supabase
    .from("raffle_sales")
    .select("id", { count: "exact", head: true })
    .eq("raffle_id", raffleId);

  if (countError) throw new Error("Erro ao verificar histórico de vendas da rifa.");
  if (count && count > 0) {
    throw new Error(
      "Esta rifa possui vendas registradas e não pode ser excluída para preservar o histórico. Se desejar, encerre ou cancele a rifa.",
    );
  }

  // Busca dados da rifa para registrar no log de auditoria
  const { data: raffle } = await supabase
    .from("raffles")
    .select("id, title, slug, total_points")
    .eq("id", raffleId)
    .single();

  // Deleta os números gerados para a rifa
  const { error: pointsError } = await supabase
    .from("raffle_points")
    .delete()
    .eq("raffle_id", raffleId);

  if (pointsError) throw new Error("Não foi possível remover os números da rifa.");

  // Deleta a rifa
  const { error: deleteError } = await supabase
    .from("raffles")
    .delete()
    .eq("id", raffleId);

  if (deleteError) throw new Error("Não foi possível excluir a rifa.");

  await supabase.from("audit_logs").insert({
    action: "RAFFLE_DELETED",
    entity_type: "raffle",
    entity_id: raffleId,
    user_id: userId,
    old_data: raffle ?? { id: raffleId },
  });

  updateTag("raffles");
  revalidatePath("/admin/rifas");
}

