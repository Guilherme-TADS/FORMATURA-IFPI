import type { Metadata } from "next";
import Link from "next/link";
import { centsToBRL } from "@/lib/money";
import { getEventInfo } from "@/lib/settings";
import { getPublicRaffleList } from "@/lib/public-raffles";

export const metadata: Metadata = {
  title: "Rifas",
  description: "Participe das rifas da comissão de formatura.",
};

export default async function PublicRafflesPage() {
  const [raffles, event] = await Promise.all([
    getPublicRaffleList(),
    getEventInfo(),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-4 py-10 sm:p-10">
      <h1 className="mb-2 text-3xl font-semibold tracking-tight">Rifas</h1>
      <p className="text-muted-foreground mb-8">
        Escolha seus números e apoie {event.name}.
      </p>

      {!raffles || raffles.length === 0 ? (
        <p className="text-muted-foreground">
          Nenhuma rifa disponível no momento.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-5">
          {raffles.map((raffle) => (
            <Link
              key={raffle.id}
              href={`/rifas/${raffle.slug}`}
              className="bg-card ring-foreground/8 group relative flex flex-col overflow-hidden rounded-lg shadow-[0_1px_2px_oklch(0.3_0.02_85_/_0.06)] ring-1 transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-12px_oklch(0.3_0.02_85_/_0.25)]"
            >
              {raffle.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={raffle.image_url}
                  alt=""
                  className="h-40 w-full object-cover"
                />
              ) : (
                <div
                  aria-hidden
                  className="bg-secondary/60 flex h-24 w-full items-center justify-center"
                >
                  <span className="stamp text-muted-foreground border-muted-foreground text-xs">
                    Rifa
                  </span>
                </div>
              )}
              <div className="receipt-divider flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="line-clamp-2 font-medium text-balance">{raffle.title}</p>
                  <p className="label-tag mt-1.5">
                    {raffle.status === "CLOSED" ? "Encerrada" : "Números disponíveis"}
                  </p>
                </div>
                <p className="font-figures text-primary shrink-0 text-lg font-semibold">
                  {centsToBRL(raffle.unit_price_cents ?? 0)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
