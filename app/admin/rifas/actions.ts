"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { brlStringToCents } from "@/lib/money";
import { raffleFormSchema, type RaffleFormValues } from "@/lib/schemas/raffle";
import { SETTINGS_KEYS, type RaffleWinner } from "@/lib/settings";

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

  // Deleta os números gerados para a rifa e a rifa via admin client
  const admin = createAdminClient();

  const { error: pointsError } = await admin
    .from("raffle_points")
    .delete()
    .eq("raffle_id", raffleId);

  if (pointsError) throw new Error("Não foi possível remover os números da rifa.");

  // Deleta a rifa
  const { error: deleteError } = await admin
    .from("raffles")
    .delete()
    .eq("id", raffleId);

  if (deleteError) throw new Error("Não foi possível excluir a rifa.");

  await admin.from("audit_logs").insert({
    action: "RAFFLE_DELETED",
    entity_type: "raffle",
    entity_id: raffleId,
    user_id: userId,
    old_data: raffle ?? { id: raffleId },
  });

  updateTag("raffles");
  revalidatePath("/admin/rifas");
}

export type DrawWinnerResult = {
  error?: string;
  winner?: RaffleWinner;
};

export async function drawRaffleWinner(
  raffleId: string,
  manualPointNumber?: number,
  notes?: string,
): Promise<DrawWinnerResult> {
  try {
    const { supabase, userId } = await requireAdmin();

    const { data: raffle, error: raffleError } = await supabase
      .from("raffles")
      .select("id, title, slug, status")
      .eq("id", raffleId)
      .single();

    if (raffleError || !raffle) {
      return { error: "Rifa não encontrada." };
    }

    if (raffle.status !== "CLOSED") {
      return { error: "A rifa precisa estar encerrada para realizar o sorteio." };
    }

    let chosenPoint: { id: string; point_number: number };

    if (manualPointNumber != null) {
      const { data: point, error: pointError } = await supabase
        .from("raffle_points")
        .select("id, point_number, status")
        .eq("raffle_id", raffleId)
        .eq("point_number", manualPointNumber)
        .maybeSingle();

      if (pointError || !point) {
        return { error: `O número ${manualPointNumber} não existe nesta rifa.` };
      }
      if (point.status !== "SOLD") {
        return { error: `O número ${manualPointNumber} não foi vendido (status atual: ${point.status}). Apenas números confirmados como vendidos podem ser sorteados.` };
      }
      chosenPoint = { id: point.id, point_number: point.point_number };
    } else {
      const { data: soldPoints, error: soldError } = await supabase
        .from("raffle_points")
        .select("id, point_number")
        .eq("raffle_id", raffleId)
        .eq("status", "SOLD");

      if (soldError || !soldPoints || soldPoints.length === 0) {
        return { error: "Não há números vendidos nesta rifa para realizar o sorteio." };
      }

      const randomIndex = Math.floor(Math.random() * soldPoints.length);
      chosenPoint = soldPoints[randomIndex];
    }

    // Identifica o comprador do ponto sorteado
    const { data: salePoint } = await supabase
      .from("raffle_sale_points")
      .select("sale_id, raffle_sales(status, buyer_id, buyers(full_name, phone))")
      .eq("point_id", chosenPoint.id)
      .maybeSingle();

    const buyerData = (salePoint?.raffle_sales as unknown as {
      status?: string;
      buyers?: { full_name?: string; phone?: string } | null;
    } | null)?.buyers;

    const buyerName = buyerData?.full_name?.trim() || "Comprador não identificado";
    const buyerPhone = buyerData?.phone?.trim() || null;

    // Busca o perfil do administrador que realizou o sorteio
    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .single();

    // Carrega o registro atual de ganhadores em system_settings
    const { data: settingsRow } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", SETTINGS_KEYS.raffleWinners)
      .maybeSingle();

    const currentWinners = (settingsRow?.value as Record<string, RaffleWinner> | undefined) ?? {};

    const newWinner: RaffleWinner = {
      raffleId,
      pointNumber: chosenPoint.point_number,
      buyerName,
      buyerPhone,
      drawnAt: new Date().toISOString(),
      drawnByName: adminProfile?.full_name ?? "Administrador",
      notes: notes?.trim() || null,
    };

    currentWinners[raffleId] = newWinner;

    const { error: upsertErr } = await supabase.from("system_settings").upsert(
      {
        key: SETTINGS_KEYS.raffleWinners,
        value: currentWinners,
        updated_by: userId,
      },
      { onConflict: "key" },
    );

    if (upsertErr) {
      return { error: "Erro ao registrar o ganhador no sistema." };
    }

    // Registra no log de auditoria via admin client
    const admin = createAdminClient();
    await admin.from("audit_logs").insert({
      action: "RAFFLE_WINNER_DRAWN",
      entity_type: "raffle",
      entity_id: raffleId,
      user_id: userId,
      new_data: newWinner,
    });

    updateTag("settings");
    updateTag("raffles");
    revalidatePath(`/admin/rifas/${raffleId}`);
    revalidatePath(`/rifas/${raffle.slug}`);
    revalidatePath("/rifas");

    return { winner: newWinner };
  } catch (err) {
    if (err instanceof Error && err.message === "not authorized") {
      return { error: "Apenas administradores podem realizar o sorteio." };
    }
    return { error: "Ocorreu um erro ao processar o sorteio." };
  }
}

export async function clearRaffleWinner(raffleId: string): Promise<RaffleActionState> {
  try {
    const { supabase, userId } = await requireAdmin();

    const { data: settingsRow } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", SETTINGS_KEYS.raffleWinners)
      .maybeSingle();

    const currentWinners = (settingsRow?.value as Record<string, RaffleWinner> | undefined) ?? {};
    if (!currentWinners[raffleId]) {
      return {};
    }

    const previousWinner = currentWinners[raffleId];
    delete currentWinners[raffleId];

    await supabase.from("system_settings").upsert(
      {
        key: SETTINGS_KEYS.raffleWinners,
        value: currentWinners,
        updated_by: userId,
      },
      { onConflict: "key" },
    );

    const admin = createAdminClient();
    await admin.from("audit_logs").insert({
      action: "RAFFLE_WINNER_CLEARED",
      entity_type: "raffle",
      entity_id: raffleId,
      user_id: userId,
      old_data: previousWinner,
    });

    updateTag("settings");
    updateTag("raffles");
    revalidatePath(`/admin/rifas/${raffleId}`);
    revalidatePath("/rifas");

    return {};
  } catch (err) {
    if (err instanceof Error && err.message === "not authorized") {
      return { error: "Apenas administradores podem alterar o sorteio." };
    }
    return { error: "Erro ao limpar o ganhador." };
  }
}

