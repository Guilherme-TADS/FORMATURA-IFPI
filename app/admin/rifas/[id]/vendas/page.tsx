import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { SalesTable, type SaleItem } from "./sales-table";

export const instant = false;

export const metadata: Metadata = { title: "Vendas da rifa" };

export default async function RaffleSalesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { id } = await params;
  const { status: statusFilter } = await searchParams;
  const supabase = await createClient();

  const [{ data: raffle }, profile, { data: allSales }] = await Promise.all([
    supabase.from("raffles").select("id, title").eq("id", id).single(),
    getCurrentProfile(),
    supabase
      .from("raffle_sales")
      .select(
        "id, amount_cents, status, created_at, cancelled_reason, buyers(full_name, phone), payment_methods(name), profiles!raffle_sales_seller_id_fkey(full_name), raffle_sale_points(raffle_points(point_number))",
      )
      .eq("raffle_id", id)
      .order("created_at", { ascending: false }),
  ]);
  if (!raffle) notFound();

  const rawSales = allSales ?? [];
  const allSaleIds = rawSales.map((s) => s.id);

  const [{ data: approvedLogs }, { data: attachments }] = await Promise.all([
    allSaleIds.length > 0
      ? supabase
          .from("audit_logs")
          .select("entity_id")
          .eq("entity_type", "raffle_sale")
          .eq("action", "SALE_APPROVED")
          .in("entity_id", allSaleIds)
      : Promise.resolve({ data: [] }),
    allSaleIds.length > 0
      ? supabase
          .from("attachments")
          .select("id, entity_id, file_name, description")
          .eq("entity_type", "raffle_sale")
          .in("entity_id", allSaleIds)
      : Promise.resolve({ data: [] }),
  ]);

  const approvedSaleIds = new Set(approvedLogs?.map((l) => l.entity_id));
  const attachmentMap = new Map<string, string>();
  const hashToSaleIds = new Map<string, string[]>();

  for (const att of attachments ?? []) {
    if (att.entity_id) {
      attachmentMap.set(att.entity_id, att.id);
      const desc = (att as { description?: string | null }).description;
      if (desc && desc.startsWith("sha256:")) {
        const hash = desc.slice(7);
        const list = hashToSaleIds.get(hash) ?? [];
        list.push(att.entity_id);
        hashToSaleIds.set(hash, list);
      }
    }
  }

  // Hashes que aparecem mais de uma vez nesta rifa
  const duplicateHashes = new Set<string>();
  for (const [hash, ids] of hashToSaleIds.entries()) {
    if (ids.length > 1) {
      duplicateHashes.add(hash);
    }
  }

  // Uma venda é PENDING se foi feita por autoatendimento (sem seller_id) e ainda não foi aprovada pelo admin
  const sales: SaleItem[] = rawSales.map((sale) => {
    let effectiveStatus: "PENDING" | "CONFIRMED" | "CANCELLED" = "CONFIRMED";
    if (sale.status === "CANCELLED") {
      effectiveStatus = "CANCELLED";
    } else if (!sale.profiles && !approvedSaleIds.has(sale.id)) {
      effectiveStatus = "PENDING";
    } else {
      effectiveStatus = "CONFIRMED";
    }

    const att = attachments?.find((a) => a.entity_id === sale.id);
    const desc = (att as { description?: string | null })?.description;
    const hash = desc?.startsWith("sha256:") ? desc.slice(7) : null;
    const isDuplicateProof = Boolean(hash && duplicateHashes.has(hash));

    return {
      ...sale,
      effectiveStatus,
      attachmentId: att?.id ?? null,
      isDuplicateProof,
    };
  });

  const totalCount = sales.length;
  const pendingCount = sales.filter((s) => s.effectiveStatus === "PENDING").length;
  const confirmedCount = sales.filter((s) => s.effectiveStatus === "CONFIRMED").length;
  const cancelledCount = sales.filter((s) => s.effectiveStatus === "CANCELLED").length;

  // Filtra as vendas exibidas se houver filtro selecionado
  const filteredSales = statusFilter
    ? sales.filter((s) => s.effectiveStatus === statusFilter)
    : sales;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Vendas — {raffle.title}
          </h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {totalCount} {totalCount === 1 ? "venda registrada" : "vendas registradas"}
          </p>
        </div>

        {/* Abas de Filtro */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-muted/40 p-1 text-xs">
          <Link
            href={`/admin/rifas/${id}/vendas`}
            className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
              !statusFilter
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Todas ({totalCount})
          </Link>
          <Link
            href={`/admin/rifas/${id}/vendas?status=PENDING`}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors ${
              statusFilter === "PENDING"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span>Pendentes</span>
            {pendingCount > 0 && (
              <span className="rounded-full bg-amber-500/20 px-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                {pendingCount}
              </span>
            )}
          </Link>
          <Link
            href={`/admin/rifas/${id}/vendas?status=CONFIRMED`}
            className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
              statusFilter === "CONFIRMED"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Confirmadas ({confirmedCount})
          </Link>
          <Link
            href={`/admin/rifas/${id}/vendas?status=CANCELLED`}
            className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
              statusFilter === "CANCELLED"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Canceladas ({cancelledCount})
          </Link>
        </div>
      </div>

      {/* Alerta de Vendas Pendentes de Conferência */}
      {pendingCount > 0 && !statusFilter && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-sm text-amber-800 dark:text-amber-300">
          <div className="flex items-center gap-2">
            <span className="text-base">⏳</span>
            <span>
              Existem <strong>{pendingCount} {pendingCount === 1 ? "venda pendente" : "vendas pendentes"}</strong> aguardando conferência do comprovante.
            </span>
          </div>
          <Link
            href={`/admin/rifas/${id}/vendas?status=PENDING`}
            className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
          >
            Filtrar pendentes
          </Link>
        </div>
      )}

      {filteredSales.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground text-sm">
            Nenhuma venda encontrada {statusFilter ? "neste filtro." : "ainda."}
          </p>
        </div>
      ) : (
        <SalesTable
          raffleId={id}
          sales={filteredSales}
          isAdmin={profile?.role === "ADMIN"}
        />
      )}
    </div>
  );
}
