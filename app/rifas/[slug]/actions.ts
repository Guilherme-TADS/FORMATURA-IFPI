"use server";

import { updateTag, revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export async function releaseReservation(
  raffleId: string,
  raffleSlug: string,
  reservationToken: string,
) {
  if (!reservationToken || !raffleId) return;

  const admin = createAdminClient();
  await admin
    .from("raffle_points")
    .update({
      status: "AVAILABLE",
      reserved_until: null,
      reservation_token: null,
    })
    .eq("raffle_id", raffleId)
    .eq("reservation_token", reservationToken)
    .eq("status", "RESERVED");

  updateTag("raffles");
  revalidatePath(`/rifas/${raffleSlug}`);
}
