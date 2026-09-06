import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = { title: "Números da rifa" };

const PAGE_SIZE = 200;

type PointStatus = Database["public"]["Enums"]["point_status"];

const statusLabels: Record<PointStatus, string> = {
  AVAILABLE: "Disponível",
  RESERVED: "Reservado",
  SOLD: "Vendido",
  CANCELLED: "Cancelado",
};

const POINT_STATUSES: PointStatus[] = [
  "AVAILABLE",
  "RESERVED",
  "SOLD",
  "CANCELLED",
];

function isPointStatus(value: string): value is PointStatus {
  return (POINT_STATUSES as string[]).includes(value);
}

const statusClasses: Record<string, string> = {
  AVAILABLE: "bg-card border-border text-foreground",
  RESERVED: "bg-pending-bg border-pending/40 text-pending",
  SOLD: "bg-confirmed-bg border-confirmed/40 text-confirmed",
  CANCELLED: "bg-void-bg border-void/30 text-void/70 line-through decoration-2",
};

export default async function RaffleNumbersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; page?: string; numero?: string }>;
}) {
  const { id } = await params;
  const { status, page: pageParam, numero } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const supabase = await createClient();

  const { data: raffle } = await supabase
    .from("raffles")
    .select("id, title")
    .eq("id", id)
    .single();
  if (!raffle) notFound();

  let query = supabase
    .from("raffle_points")
    .select("point_number, status", { count: "exact" })
    .eq("raffle_id", id)
    .order("point_number", { ascending: true });

  if (status && status !== "ALL" && isPointStatus(status)) {
    query = query.eq("status", status);
  }
  if (numero) {
    query = query.eq("point_number", Number(numero));
  }
  if (!numero) {
    query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  }

  const { data: pointsPage, count } = await query;
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  function pageHref(nextPage: number) {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    p.set("page", String(nextPage));
    return `?${p.toString()}`;
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">
        Números — {raffle.title}
      </h1>
      <p className="text-muted-foreground font-figures mb-4 text-sm">
        {count ?? 0} números no total
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["ALL", "AVAILABLE", "RESERVED", "SOLD", "CANCELLED"] as const).map(
          (s) => (
            <Link
              key={s}
              href={`?${new URLSearchParams({ ...(s !== "ALL" ? { status: s } : {}) }).toString()}`}
              className={cn(
                "rounded-md border px-3 py-1 text-xs font-medium transition-colors",
                (status ?? "ALL") === s
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-secondary",
              )}
            >
              {s === "ALL" ? "Todos" : statusLabels[s]}
            </Link>
          ),
        )}
        <form className="ml-auto flex items-center gap-2" action="">
          <input
            type="number"
            name="numero"
            defaultValue={numero}
            placeholder="Buscar número"
            className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-32 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3"
          />
        </form>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2">
        {(pointsPage ?? []).map((point) => (
          <div
            key={point.point_number}
            title={statusLabels[point.status]}
            className={cn(
              "flex flex-col items-center rounded-md border py-2 text-xs font-medium",
              statusClasses[point.status],
            )}
          >
            <span className="font-figures text-sm font-semibold">{point.point_number}</span>
            <span className="mt-0.5 text-[9px] font-semibold tracking-wide uppercase opacity-70">
              {statusLabels[point.status]}
            </span>
          </div>
        ))}
      </div>

      {!numero && totalPages > 1 ? (
        <div className="mt-6 flex items-center gap-2 text-sm">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="underline">
              Anterior
            </Link>
          ) : null}
          <span className="text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={pageHref(page + 1)} className="underline">
              Próxima
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3 text-xs">
        {Object.entries(statusLabels).map(([key, label]) => (
          <Badge key={key} variant="outline" className={statusClasses[key]}>
            {label}
          </Badge>
        ))}
      </div>
    </div>
  );
}
