import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

// These read from the same public_* views the anonymous client is already
// granted SELECT on, via the admin client only so the query itself contains
// no cookies() access and can live inside a "use cache" scope — the data
// returned is exactly what any anonymous visitor could already fetch
// directly. Never widen these to a non-public view or table.

export async function getPublicRaffleList() {
  "use cache";
  cacheLife("minutes");
  cacheTag("raffles");

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("public_raffles")
    .select("*")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getPublicRaffleBySlug(slug: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag("raffles");

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("public_raffles")
    .select("*")
    .eq("slug", slug)
    .single();
  return data;
}

export async function getPublicPaymentMethods() {
  "use cache";
  cacheLife("hours");
  cacheTag("payment-methods");

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("public_payment_methods")
    .select("*")
    .order("name");
  return data ?? [];
}
