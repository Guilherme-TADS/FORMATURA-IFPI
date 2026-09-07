import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_UPLOAD_LIMITS, type UploadLimits } from "@/lib/uploads";

// system_settings is a plain key/value jsonb table (see migration
// 20260819080200_reference_tables.sql) — these are the keys this app reads.
// A missing row always falls back to the hardcoded default below, so the
// app works identically before anyone touches /admin/configuracoes.
export const SETTINGS_KEYS = {
  eventInfo: "event_info",
  uploadLimits: "upload_limits",
  reservationTtlMinutes: "reservation_ttl_minutes",
  pixInfo: "pix_info",
  mercadoPagoConfig: "mercadopago_config",
  raffleWinners: "raffle_winners",
} as const;

export type EventInfo = {
  name: string;
  course: string;
  className: string;
};

export type PixInfo = {
  key: string;
  merchantName: string;
  merchantCity: string;
};

export type MercadoPagoConfig = {
  enabled: boolean;
  accessToken: string;
  publicKey?: string;
};

export const DEFAULT_PIX_INFO: PixInfo = {
  key: process.env.NEXT_PUBLIC_PIX_KEY || "",
  merchantName: "Comissao Formatura",
  merchantCity: "Teresina",
};

export const DEFAULT_MERCADOPAGO_CONFIG: MercadoPagoConfig = {
  enabled: false,
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN || "",
  publicKey: process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY || "",
};

export const DEFAULT_EVENT_INFO: EventInfo = {
  name: "Comissão de Formatura",
  course: "",
  className: "",
};

export const DEFAULT_RESERVATION_TTL_MINUTES = 15;

// Uses the admin client (not the caller's session) because these values must
// be readable by anonymous public buyers too (upload limits apply to the
// public comprovante route), and system_settings' RLS policy only grants
// SELECT to authenticated staff. Config values here are non-sensitive.
async function getSetting<T>(key: string): Promise<T | null> {
  "use cache";
  cacheLife("hours");
  cacheTag("settings");

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return (data?.value as T | undefined) ?? null;
}

export async function getEventInfo(): Promise<EventInfo> {
  const value = await getSetting<Partial<EventInfo>>(SETTINGS_KEYS.eventInfo);
  return { ...DEFAULT_EVENT_INFO, ...value };
}

export async function getUploadLimits(): Promise<UploadLimits> {
  const value = await getSetting<Partial<UploadLimits>>(SETTINGS_KEYS.uploadLimits);
  if (!value || !value.maxSizeBytes || !value.allowedMimeTypes?.length) {
    return DEFAULT_UPLOAD_LIMITS;
  }
  return { maxSizeBytes: value.maxSizeBytes, allowedMimeTypes: value.allowedMimeTypes };
}

export async function getReservationTtlMinutes(): Promise<number> {
  const value = await getSetting<number>(SETTINGS_KEYS.reservationTtlMinutes);
  return typeof value === "number" && value > 0 ? value : DEFAULT_RESERVATION_TTL_MINUTES;
}

export async function getPixInfo(): Promise<PixInfo> {
  const value = await getSetting<Partial<PixInfo>>(SETTINGS_KEYS.pixInfo);
  return { ...DEFAULT_PIX_INFO, ...value };
}

export async function getMercadoPagoConfig(): Promise<MercadoPagoConfig> {
  const value = await getSetting<Partial<MercadoPagoConfig>>(SETTINGS_KEYS.mercadoPagoConfig);
  const config = { ...DEFAULT_MERCADOPAGO_CONFIG, ...value };
  if (!config.accessToken && process.env.MERCADO_PAGO_ACCESS_TOKEN) {
    config.accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  }
  return config;
}

export type RaffleWinner = {
  raffleId: string;
  pointNumber: number;
  buyerName: string;
  buyerPhone?: string | null;
  drawnAt: string;
  drawnByName?: string | null;
  notes?: string | null;
};

export async function getRaffleWinners(): Promise<Record<string, RaffleWinner>> {
  const value = await getSetting<Record<string, RaffleWinner>>(SETTINGS_KEYS.raffleWinners);
  return value ?? {};
}

export async function getRaffleWinner(raffleId: string): Promise<RaffleWinner | null> {
  const winners = await getRaffleWinners();
  return winners[raffleId] ?? null;
}

export async function getAllSettings() {
  const [eventInfo, uploadLimits, reservationTtlMinutes, pixInfo, mercadoPagoConfig] = await Promise.all([
    getEventInfo(),
    getUploadLimits(),
    getReservationTtlMinutes(),
    getPixInfo(),
    getMercadoPagoConfig(),
  ]);
  return { eventInfo, uploadLimits, reservationTtlMinutes, pixInfo, mercadoPagoConfig };
}
