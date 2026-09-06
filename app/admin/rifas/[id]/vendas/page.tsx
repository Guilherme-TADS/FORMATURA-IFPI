import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { centsToBRL } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { SaleRow } from "./sale-row";

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
          .select("id, entity_id, file_name")
          .eq("entity_type", "raffle_sale")
          .in("entity_id", allSaleIds)
      : Promise.resolve({ data: [] }),
  ]);

  const approvedSaleIds = new Set(approvedLogs?.map((l) => l.entity_id));
  const attachmentMap = new Map<string, string>();
  for (const att of attachments ?? []) {
    if (att.entity_id) {
      attachmentMap.set(att.entity_id, att.id);
    }
  }

  // Uma venda é PENDING se foi feita por autoatendimento (sem seller_id) e ainda não foi aprovada pelo admin
  const sales = rawSales.map((sale) => {
    let effectiveStatus: "PENDING" | "CONFIRMED" | "CANCELLED" = "CONFIRMED";
    if (sale.status === "CANCELLED") {
      effectiveStatus = "CANCELLED";
    } else if (!sale.profiles && !approvedSaleIds.has(sale.id)) {
      effectiveStatus = "PENDING";
    } else {
      effectiveStatus = "CONFIRMED";
    }
    return { ...sale, effectiveStatus };
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
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-border border-b bg-muted/30 text-left text-xs text-muted-foreground">
                <th className="py-2.5 pl-4 pr-3 font-medium">Comprador</th>
                <th className="py-2.5 pr-3 font-medium">Números</th>
                <th className="py-2.5 pr-3 font-medium">Valor</th>
                <th className="py-2.5 pr-3 font-medium">Pagamento</th>
                <th className="py-2.5 pr-3 font-medium">Vendedor</th>
                <th className="py-2.5 pr-3 font-medium">Status</th>
                <th className="py-2.5 pr-3 font-medium">Data</th>
                {profile?.role === "ADMIN" ? (
                  <th className="py-2.5 pr-4 text-right font-medium">Ações</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredSales.map((sale) => {
                const isPending = sale.effectiveStatus === "PENDING";
                const isConfirmed = sale.effectiveStatus === "CONFIRMED";
                const attachmentId = attachmentMap.get(sale.id);

                return (
                  <tr
                    key={sale.id}
                    className={`transition-colors hover:bg-muted/20 ${
                      isPending ? "bg-amber-500/[0.04]" : ""
                    }`}
                  >
                    <td className="py-3 pl-4 pr-3">
                      <div className="font-medium">{sale.buyers?.full_name}</div>
                      <div className="text-muted-foreground font-figures text-xs">
                        {sale.buyers?.phone}
                      </div>
                    </td>
                    <td className="font-figures py-3 pr-3 font-medium">
                      {sale.raffle_sale_points
                        .map((sp) => sp.raffle_points?.point_number)
                        .filter((n) => n !== undefined)
                        .sort((a, b) => (a ?? 0) - (b ?? 0))
                        .join(", ")}
                    </td>
                    <td className="font-figures py-3 pr-3 font-semibold text-primary">
                      {centsToBRL(sale.amount_cents)}
                    </td>
                    <td className="py-3 pr-3">
                      <span className="text-xs font-medium">
                        {sale.payment_methods?.name}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-xs text-muted-foreground">
                      {sale.profiles?.full_name ?? "Autoatendimento"}
                    </td>
                    <td className="py-3 pr-3">
                      {isPending ? (
                        <Badge variant="pending" stamp>
                          Pendente
                        </Badge>
                      ) : isConfirmed ? (
                        <Badge variant="confirmed" stamp>
                          Confirmada
                        </Badge>
                      ) : (
                        <Badge variant="void" stamp>
                          Cancelada
                        </Badge>
                      )}
                    </td>
                    <td className="font-figures py-3 pr-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(sale.created_at).toLocaleString("pt-BR")}
                    </td>
                    {profile?.role === "ADMIN" ? (
                      <td className="py-3 pr-4 text-right">
                        <SaleRow
                          raffleId={id}
                          saleId={sale.id}
                          status={sale.effectiveStatus}
                          attachmentId={attachmentId}
                          cancelledReason={sale.cancelled_reason}
                        />
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
