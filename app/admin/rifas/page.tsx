import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { LinkButton } from "@/components/ui/link-button";
import { Badge } from "@/components/ui/badge";
import { centsToBRL } from "@/lib/money";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = { title: "Rifas" };

const statusLabels: Record<string, string> = {
  OPEN: "Aberta",
  CLOSED: "Encerrada",
  CANCELLED: "Cancelada",
};

const statusVariants: Record<string, "confirmed" | "outline" | "void"> = {
  OPEN: "confirmed",
  CLOSED: "outline",
  CANCELLED: "void",
};

export default async function RafflesPage() {
  const supabase = await createClient();

  const { data: raffles } = await supabase
    .from("raffles")
    .select("id, title, slug, status, total_points, unit_price_cents, created_at")
    .order("created_at", { ascending: false });

  const raffleIds = (raffles ?? []).map((r) => r.id);

  const [{ data: points }, { data: sales }] = await Promise.all([
    raffleIds.length
      ? supabase.from("raffle_points").select("raffle_id, status").in("raffle_id", raffleIds)
      : Promise.resolve({ data: [] as { raffle_id: string; status: string }[] }),
    raffleIds.length
      ? supabase
          .from("raffle_sales")
          .select("raffle_id, amount_cents")
          .in("raffle_id", raffleIds)
          .eq("status", "CONFIRMED")
      : Promise.resolve({ data: [] as { raffle_id: string; amount_cents: number }[] }),
  ]);

  const profile = await getCurrentProfile();
  const isAdmin = profile?.role === "ADMIN";

  const statusCounts = new Map<string, Record<string, number>>();
  for (const p of points ?? []) {
    const entry = statusCounts.get(p.raffle_id) ?? {};
    entry[p.status] = (entry[p.status] ?? 0) + 1;
    statusCounts.set(p.raffle_id, entry);
  }

  const revenueByRaffle = new Map<string, number>();
  for (const s of sales ?? []) {
    revenueByRaffle.set(
      s.raffle_id,
      (revenueByRaffle.get(s.raffle_id) ?? 0) + s.amount_cents,
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Rifas</h1>
        {isAdmin ? (
          <LinkButton href="/admin/rifas/nova">
            <Plus className="size-4" />
            Nova rifa
          </LinkButton>
        ) : null}
      </div>

      {!raffles || raffles.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nenhuma rifa criada ainda.
        </p>
      ) : (
        <div className="grid gap-3">
          {raffles.map((raffle) => {
            const counts = statusCounts.get(raffle.id) ?? {};
            const sold = counts.SOLD ?? 0;
            const reserved = counts.RESERVED ?? 0;
            const available = counts.AVAILABLE ?? 0;
            const revenue = revenueByRaffle.get(raffle.id) ?? 0;

            return (
              <Link
                key={raffle.id}
                href={`/admin/rifas/${raffle.id}`}
                className="bg-card ring-foreground/8 hover:ring-primary/40 rounded-lg p-4 ring-1 transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-12px_oklch(0.3_0.02_85_/_0.3)]"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">{raffle.title}</p>
                    <p className="text-muted-foreground font-figures text-sm">
                      {centsToBRL(raffle.unit_price_cents)} por número ·{" "}
                      {raffle.total_points} números
                    </p>
                  </div>
                  <Badge variant={statusVariants[raffle.status]} stamp>
                    {statusLabels[raffle.status]}
                  </Badge>
                </div>
                <div className="receipt-divider text-muted-foreground font-figures mt-3 flex flex-wrap gap-x-4 gap-y-1 pt-3 text-xs">
                  <span>{sold} vendidos</span>
                  <span>{reserved} reservados</span>
                  <span>{available} disponíveis</span>
                  <span>Faturamento: {centsToBRL(revenue)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
