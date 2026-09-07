"use server";

import { revalidatePath, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { SETTINGS_KEYS, type EventInfo, type PixInfo, type MercadoPagoConfig } from "@/lib/settings";
import { DEFAULT_UPLOAD_LIMITS } from "@/lib/uploads";
import type { Json } from "@/types/database";

export type SettingsActionState = { error?: string };

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

export async function updateSettings(values: {
  eventInfo: EventInfo;
  maxUploadSizeMb: number;
  reservationTtlMinutes: number;
  pixInfo?: PixInfo;
  mercadoPagoConfig?: MercadoPagoConfig;
}): Promise<SettingsActionState> {
  if (!values.eventInfo.name.trim()) {
    return { error: "Informe o nome do evento." };
  }
  if (!Number.isFinite(values.maxUploadSizeMb) || values.maxUploadSizeMb < 1 || values.maxUploadSizeMb > 50) {
    return { error: "O limite de upload deve estar entre 1MB e 50MB." };
  }
  if (
    !Number.isFinite(values.reservationTtlMinutes) ||
    values.reservationTtlMinutes < 1 ||
    values.reservationTtlMinutes > 120
  ) {
    return { error: "O prazo de reserva deve estar entre 1 e 120 minutos." };
  }

  try {
    const { supabase, userId } = await requireAdmin();

    const rows: { key: string; value: Json; updated_by: string }[] = [
      {
        key: SETTINGS_KEYS.eventInfo,
        value: {
          name: values.eventInfo.name.trim(),
          course: values.eventInfo.course.trim(),
          className: values.eventInfo.className.trim(),
        },
        updated_by: userId,
      },
      {
        key: SETTINGS_KEYS.uploadLimits,
        value: {
          maxSizeBytes: Math.round(values.maxUploadSizeMb * 1024 * 1024),
          allowedMimeTypes: DEFAULT_UPLOAD_LIMITS.allowedMimeTypes,
        },
        updated_by: userId,
      },
      {
        key: SETTINGS_KEYS.reservationTtlMinutes,
        value: values.reservationTtlMinutes,
        updated_by: userId,
      },
    ];

    if (values.pixInfo) {
      rows.push({
        key: SETTINGS_KEYS.pixInfo,
        value: {
          key: values.pixInfo.key.trim(),
          merchantName: values.pixInfo.merchantName.trim(),
          merchantCity: values.pixInfo.merchantCity.trim(),
        },
        updated_by: userId,
      });
    }

    if (values.mercadoPagoConfig) {
      rows.push({
        key: SETTINGS_KEYS.mercadoPagoConfig,
        value: {
          enabled: Boolean(values.mercadoPagoConfig.enabled),
          accessToken: values.mercadoPagoConfig.accessToken.trim(),
          publicKey: values.mercadoPagoConfig.publicKey?.trim() || "",
        },
        updated_by: userId,
      });
    }

    const { error } = await supabase.from("system_settings").upsert(rows, { onConflict: "key" });
    if (error) return { error: "Não foi possível salvar as configurações." };

    updateTag("settings");
    revalidatePath("/admin/configuracoes");
    revalidatePath("/");
    revalidatePath("/rifas");
    return {};
  } catch (err) {
    if (err instanceof Error && err.message === "not authorized") {
      return { error: "Apenas administradores podem alterar configurações." };
    }
    throw err;
  }
}
