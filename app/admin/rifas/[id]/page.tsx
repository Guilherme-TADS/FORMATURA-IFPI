import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/link-button";
import { centsToBRL } from "@/lib/money";
import { getRaffleWinner } from "@/lib/settings";
import { RaffleActions } from "./raffle-actions";
import { RaffleDrawCard } from "./raffle-draw-card";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = { title: "Detalhes da rifa" };

const statusLabels: Record<string, string> = {
  OPEN: "Aberta",
  CLOSED: "Encerrada",
  CANCELLED: "Cancelada",
};

export default async function RaffleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: raffle }, profile, { data: points }, { data: sales }, { count: totalSalesCount }, winner] = await Promise.all([
    supabase.from("raffles").select("*").eq("id", id).single(),
    getCurrentProfile(),
    supabase.from("raffle_points").select("status").eq("raffle_id", id).limit(100000),
    supabase
      .from("raffle_sales")
      .select("amount_cents")
      .eq("raffle_id", id)
      .eq("status", "CONFIRMED"),
    supabase
      .from("raffle_sales")
      .select("id", { count: "exact", head: true })
      .eq("raffle_id", id),
    getRaffleWinner(id),
  ]);

  if (!raffle) notFound();
  const isAdmin = profile?.role === "ADMIN";

  const counts = { AVAILABLE: 0, RESERVED: 0, SOLD: 0, CANCELLED: 0 } as Record<
    string,
    number
  >;
  for (const p of points ?? []) counts[p.status] = (counts[p.status] ?? 0) + 1;
  const revenue = (sales ?? []).reduce((sum, s) => sum + s.amount_cents, 0);

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {raffle.title}
            </h1>
            <Badge
              variant={
                raffle.status === "OPEN"
                  ? "confirmed"
                  : raffle.status === "CANCELLED"
                    ? "void"
                    : "outline"
              }
              stamp
            >
              {statusLabels[raffle.status]}
            </Badge>
          </div>
          <p className="text-muted-foreground font-figures text-sm">/rifas/{raffle.slug}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton variant="outline" size="sm" href={`/admin/rifas/${id}/numeros`}>
            Ver números
          </LinkButton>
          <LinkButton variant="outline" size="sm" href={`/admin/rifas/${id}/vendas`}>
            Ver vendas
          </LinkButton>
          {isAdmin && raffle.status !== "CANCELLED" ? (
            <LinkButton variant="outline" size="sm" href={`/admin/rifas/${id}/editar`}>
              Editar
            </LinkButton>
          ) : null}
          <LinkButton variant="outline" size="sm" href={`/rifas/${raffle.slug}`} target="_blank">
            Ver página pública
          </LinkButton>
        </div>
      </div>

      <div className="border-border bg-card ring-foreground/8 mb-6 grid grid-cols-2 divide-x divide-y divide-dashed divide-border overflow-hidden rounded-lg border ring-1 sm:grid-cols-4 sm:divide-y-0">
        <div className="p-3.5">
          <p className="label-tag">Vendidos</p>
          <p className="font-figures mt-1 text-xl font-semibold">{counts.SOLD}</p>
        </div>
        <div className="p-3.5">
          <p className="label-tag">Reservados</p>
          <p className="font-figures mt-1 text-xl font-semibold">{counts.RESERVED}</p>
        </div>
        <div className="p-3.5">
          <p className="label-tag">Disponíveis</p>
          <p className="font-figures mt-1 text-xl font-semibold">{counts.AVAILABLE}</p>
        </div>
        <div className="p-3.5">
          <p className="label-tag">Faturamento</p>
          <p className="font-figures mt-1 text-xl font-semibold">{centsToBRL(revenue)}</p>
        </div>
      </div>

      <RaffleDrawCard
        raffleId={id}
        raffleStatus={raffle.status}
        winner={winner}
        soldCount={counts.SOLD}
        isAdmin={isAdmin}
      />

      {raffle.description ? (
        <p className="mb-4 text-sm whitespace-pre-wrap">{raffle.description}</p>
      ) : null}

      <dl className="text-muted-foreground mb-6 grid gap-1.5 text-sm">
        <div className="flex gap-2">
          <dt className="text-foreground font-medium">Valor por número:</dt>
          <dd className="font-figures">{centsToBRL(raffle.unit_price_cents)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-foreground font-medium">Início:</dt>
          <dd className="font-figures">{new Date(raffle.starts_at).toLocaleString("pt-BR")}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-foreground font-medium">Encerramento:</dt>
          <dd className="font-figures">{new Date(raffle.ends_at).toLocaleString("pt-BR")}</dd>
        </div>
        {raffle.google_sheet_url ? (
          <div className="flex gap-2">
            <dt className="text-foreground font-medium">Planilha:</dt>
            <dd>
              <a
                href={raffle.google_sheet_url}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Abrir planilha
              </a>
            </dd>
          </div>
        ) : null}
      </dl>

      {isAdmin ? (
        <RaffleActions
          raffleId={id}
          status={raffle.status}
          canDelete={(totalSalesCount ?? 0) === 0}
          raffleTitle={raffle.title}
        />
      ) : null}
    </div>
  );
}
