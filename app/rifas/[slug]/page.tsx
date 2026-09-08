import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { LinkButton } from "@/components/ui/link-button";
import { PurchaseFlow } from "./purchase-flow";
import { centsToBRL } from "@/lib/money";
import { getReservationTtlMinutes, getPixInfo, getMercadoPagoConfig, getRaffleWinner } from "@/lib/settings";
import { getPublicRaffleBySlug, getPublicPaymentMethods } from "@/lib/public-raffles";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const raffle = await getPublicRaffleBySlug(slug);

  if (!raffle) return {};

  const title = raffle.title ?? "Rifa";

  return {
    title,
    description: raffle.description ?? undefined,
    alternates: { canonical: `/rifas/${slug}` },
    openGraph: {
      title,
      description: raffle.description ?? undefined,
      images: raffle.image_url ? [raffle.image_url] : undefined,
    },
  };
}

// The slug isn't known until request time (no generateStaticParams), so
// reading it has to happen inside this Suspense-wrapped child rather than
// at the top of the page — that's what lets the route ship an instant shell
// instead of blocking the whole response on it.
export default function RafflePublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense fallback={<RafflePageSkeleton />}>
      <RaffleContent params={params} />
    </Suspense>
  );
}

async function RaffleContent({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [raffle, paymentMethods, reservationTtlMinutes, pixInfo, profile, mercadoPagoConfig] = await Promise.all([
    getPublicRaffleBySlug(slug),
    getPublicPaymentMethods(),
    getReservationTtlMinutes(),
    getPixInfo(),
    getCurrentProfile(),
    getMercadoPagoConfig(),
  ]);

  if (!raffle) notFound();

  const winner = raffle.status === "CLOSED" ? await getRaffleWinner(raffle.id!) : null;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-4 py-8 sm:p-8">
      {profile ? (
        <aside
          aria-label="Informações do vendedor conectado"
          className="border-confirmed/40 bg-confirmed-bg text-confirmed mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3.5 text-sm"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-xl" aria-hidden="true">👤</span>
            <div>
              <p className="font-semibold text-foreground">Modo Vendedor Ativo</p>
              <p className="text-muted-foreground text-xs">
                Conectado como <strong className="text-foreground">{profile.full_name}</strong>. As vendas realizadas aqui serão vinculadas a você e confirmadas automaticamente.
              </p>
            </div>
          </div>
          <LinkButton variant="outline" size="sm" href="/admin/rifas">
            Painel Admin
          </LinkButton>
        </aside>
      ) : null}

      {raffle.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={raffle.image_url}
          alt=""
          className="ring-foreground/8 mb-6 h-56 w-full rounded-lg object-cover ring-1"
        />
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-balance">
            {raffle.title}
          </h1>
          {raffle.description ? (
            <p className="text-muted-foreground mt-2 max-w-2xl whitespace-pre-wrap">
              {raffle.description}
            </p>
          ) : null}
        </div>
        <LinkButton variant="outline" size="sm" href="/rifas/meus-bilhetes">
          🔍 Meus Bilhetes
        </LinkButton>
      </div>

      <div className="border-border bg-card ring-foreground/8 mt-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-dashed p-4 ring-1">
        <div>
          <p className="label-tag">Valor por número</p>
          <p className="font-figures text-2xl font-semibold">
            {centsToBRL(raffle.unit_price_cents ?? 0)}
          </p>
        </div>
        <Suspense
          fallback={
            <div className="text-right">
              <p className="label-tag">Disponíveis</p>
              <p className="font-figures text-2xl font-semibold">
                <span className="text-muted-foreground">…</span>
                <span className="text-muted-foreground text-base font-normal">
                  {" "}
                  / {raffle.total_points}
                </span>
              </p>
            </div>
          }
        >
          <Availability raffleId={raffle.id!} total={raffle.total_points ?? 0} />
        </Suspense>
      </div>

      {raffle.status === "CLOSED" ? (
        winner ? (
          <div className="border-amber-500/40 bg-gradient-to-br from-amber-500/15 via-background to-amber-500/5 mt-6 overflow-hidden rounded-xl border-2 p-6 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="text-3xl" aria-hidden="true">🏆</span>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-amber-900 dark:text-amber-300">
                  Resultado do Sorteio!
                </h2>
                <p className="text-muted-foreground text-xs">
                  Sorteio realizado em {new Date(winner.drawnAt).toLocaleDateString("pt-BR")}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-amber-500/30 bg-card/70 p-4">
                <p className="label-tag text-muted-foreground">Bilhete Premiado</p>
                <p className="font-figures mt-1 text-3xl font-black text-amber-700 dark:text-amber-400">
                  #{winner.pointNumber}
                </p>
              </div>
              <div className="rounded-lg border border-amber-500/30 bg-card/70 p-4">
                <p className="label-tag text-muted-foreground">Ganhador(a)</p>
                <p className="mt-1 text-xl font-bold">{winner.buyerName}</p>
                {winner.buyerPhone ? (
                  <p className="font-figures text-muted-foreground mt-0.5 text-xs">
                    Telefone: {winner.buyerPhone.length >= 8 ? `${winner.buyerPhone.slice(0, 5)}****-${winner.buyerPhone.slice(-2)}` : winner.buyerPhone}
                  </p>
                ) : null}
              </div>
            </div>

            {winner.notes ? (
              <p className="text-muted-foreground mt-3 text-xs italic">
                {winner.notes}
              </p>
            ) : null}

            <p className="text-muted-foreground mt-5 text-center text-xs">
              Parabéns ao ganhador(a) e muito obrigado a todos que participaram e apoiaram nossa formatura!
            </p>
          </div>
        ) : (
          <div className="border-border bg-secondary/60 mt-6 rounded-lg border border-dashed p-4 text-center text-sm">
            <p className="font-medium">Esta rifa já foi encerrada.</p>
            <p className="text-muted-foreground mt-1 text-xs">
              O sorteio está sendo processado pela comissão e o resultado do bilhete vencedor será publicado aqui em breve.
            </p>
          </div>
        )
      ) : (
        <PurchaseFlow
          raffleId={raffle.id!}
          raffleSlug={raffle.slug!}
          unitPriceCents={raffle.unit_price_cents!}
          paymentMethods={paymentMethods}
          reservationTtlMinutes={reservationTtlMinutes}
          pixInfo={pixInfo}
          sellerName={profile?.full_name ?? null}
          mercadoPagoEnabled={mercadoPagoConfig.enabled && Boolean(mercadoPagoConfig.accessToken)}
        />
      )}

      {raffle.rules ? (
        <details className="group receipt-divider mt-8 pt-4 text-sm">
          <summary className="cursor-pointer font-medium marker:content-none">
            <span className="inline-flex items-center gap-1.5">
              <span className="text-muted-foreground transition-transform group-open:rotate-90">
                ›
              </span>
              Regulamento
            </span>
          </summary>
          <p className="text-muted-foreground mt-2 whitespace-pre-wrap">
            {raffle.rules}
          </p>
        </details>
      ) : null}
    </main>
  );
}

// Live: how many numbers are still available changes with every sale or
// expired reservation, so it stays outside the cached shell and streams in.
async function Availability({
  raffleId,
  total,
}: {
  raffleId: string;
  total: number;
}) {
  const supabase = await createClient();
  // Libera oportunamente reservas que possam ter expirado
  await supabase.rpc("rpc_release_expired_reservations");

  const { data: points } = await supabase
    .from("public_raffle_points")
    .select("status")
    .eq("raffle_id", raffleId)
    .limit(total > 0 ? total : 100000);

  const counts = { AVAILABLE: 0, RESERVED: 0, SOLD: 0, CANCELLED: 0 } as Record<
    string,
    number
  >;
  for (const p of points ?? []) {
    if (p.status) counts[p.status] = (counts[p.status] ?? 0) + 1;
  }
  const soldFraction = total ? (counts.SOLD + counts.RESERVED) / total : 0;

  return (
    <>
      <div className="text-right">
        <p className="label-tag">Disponíveis</p>
        <p className="font-figures text-2xl font-semibold">
          {counts.AVAILABLE}
          <span className="text-muted-foreground text-base font-normal">
            {" "}
            / {total}
          </span>
        </p>
      </div>
      <div className="bg-secondary h-1.5 w-full overflow-hidden rounded-full">
        <div
          className="bg-confirmed h-full rounded-full transition-all"
          style={{ width: `${Math.round(soldFraction * 100)}%` }}
        />
      </div>
    </>
  );
}

function RafflePageSkeleton() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-4 py-8 sm:p-8">
      <div className="bg-muted mb-6 h-56 w-full animate-pulse rounded-lg" />
      <div className="bg-muted h-8 w-2/3 animate-pulse rounded-md" />
      <div className="bg-muted mt-3 h-4 w-1/2 animate-pulse rounded-md" />
      <div className="border-border bg-card mt-6 h-20 w-full animate-pulse rounded-lg border border-dashed" />
      <div className="bg-muted mt-8 h-6 w-40 animate-pulse rounded-md" />
      <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(60px,1fr))] gap-2.5">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="bg-muted h-14 animate-pulse rounded-md" />
        ))}
      </div>
    </main>
  );
}
