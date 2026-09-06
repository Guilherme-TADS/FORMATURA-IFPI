import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { RaffleForm } from "../../raffle-form";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = { title: "Editar rifa" };

export default async function EditRafflePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (profile?.role !== "ADMIN") {
    redirect(`/admin/rifas/${id}`);
  }

  const supabase = await createClient();

  const { data: raffle } = await supabase
    .from("raffles")
    .select("*")
    .eq("id", id)
    .single();

  if (!raffle) notFound();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        Editar rifa
      </h1>
      <RaffleForm
        raffleId={raffle.id}
        defaultValues={{
          title: raffle.title,
          slug: raffle.slug,
          description: raffle.description ?? "",
          rules: raffle.rules ?? "",
          imageUrl: raffle.image_url ?? "",
          totalPoints: raffle.total_points,
          unitPriceLabel: (raffle.unit_price_cents / 100).toFixed(2).replace(".", ","),
          startsAtIso: raffle.starts_at,
          endsAtIso: raffle.ends_at,
          googleSheetUrl: raffle.google_sheet_url ?? "",
          internalNotes: raffle.internal_notes ?? "",
        }}
      />
    </div>
  );
}
