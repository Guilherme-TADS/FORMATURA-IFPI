"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { centsToBRL } from "@/lib/money";
import { SaleRow } from "./sale-row";
import { approveMultipleSales } from "./actions";

export type SaleItem = {
  id: string;
  amount_cents: number;
  status: string;
  created_at: string;
  cancelled_reason: string | null;
  effectiveStatus: "PENDING" | "CONFIRMED" | "CANCELLED";
  attachmentId?: string | null;
  isDuplicateProof?: boolean;
  buyers: { full_name: string | null; phone: string | null } | null;
  payment_methods: { name: string | null } | null;
  profiles: { full_name: string | null } | null;
  raffle_sale_points: Array<{
    raffle_points: { point_number: number } | null;
  }>;
};

export function SalesTable({
  raffleId,
  sales,
  isAdmin,
}: {
  raffleId: string;
  sales: SaleItem[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const pendingSales = sales.filter((s) => s.effectiveStatus === "PENDING");
  const allPendingSelected =
    pendingSales.length > 0 &&
    pendingSales.every((s) => selectedIds.has(s.id));

  function toggleSelectAll() {
    if (allPendingSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingSales.map((s) => s.id)));
    }
  }

  function toggleSelectOne(saleId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(saleId)) {
        next.delete(saleId);
      } else {
        next.add(saleId);
      }
      return next;
    });
  }

  function handleBulkApprove() {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;

    startTransition(async () => {
      const res = await approveMultipleSales(raffleId, ids);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `${res.count ?? ids.length} venda(s) aprovada(s) com sucesso!`,
      );
      setSelectedIds(new Set());
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {/* Barra de Ações em Lote */}
      {isAdmin && selectedIds.size > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-primary">
              {selectedIds.size}{" "}
              {selectedIds.size === 1
                ? "venda selecionada"
                : "vendas selecionadas"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => setSelectedIds(new Set())}
            >
              Desmarcar
            </Button>
            <Button
              size="sm"
              disabled={pending}
              onClick={handleBulkApprove}
              className="gap-1.5"
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
              Aprovar Selecionadas ({selectedIds.size})
            </Button>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-border border-b bg-muted/30 text-left text-xs text-muted-foreground">
              {isAdmin ? (
                <th className="w-10 py-2.5 pl-4 pr-1">
                  <input
                    type="checkbox"
                    aria-label="Selecionar todas as pendentes"
                    checked={allPendingSelected}
                    disabled={pendingSales.length === 0}
                    onChange={toggleSelectAll}
                    className="accent-primary size-4 cursor-pointer rounded"
                  />
                </th>
              ) : null}
              <th className="py-2.5 pl-3 pr-3 font-medium">Comprador</th>
              <th className="py-2.5 pr-3 font-medium">Números</th>
              <th className="py-2.5 pr-3 font-medium">Valor</th>
              <th className="py-2.5 pr-3 font-medium">Pagamento</th>
              <th className="py-2.5 pr-3 font-medium">Vendedor</th>
              <th className="py-2.5 pr-3 font-medium">Status</th>
              <th className="py-2.5 pr-3 font-medium">Data</th>
              {isAdmin ? (
                <th className="py-2.5 pr-4 text-right font-medium">Ações</th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sales.map((sale) => {
              const isPending = sale.effectiveStatus === "PENDING";
              const isConfirmed = sale.effectiveStatus === "CONFIRMED";
              const isSelected = selectedIds.has(sale.id);

              return (
                <tr
                  key={sale.id}
                  className={`transition-colors hover:bg-muted/20 ${
                    isSelected
                      ? "bg-primary/[0.08]"
                      : isPending
                      ? "bg-amber-500/[0.04]"
                      : ""
                  }`}
                >
                  {isAdmin ? (
                    <td className="py-3 pl-4 pr-1">
                      {isPending ? (
                        <input
                          type="checkbox"
                          aria-label={`Selecionar venda ${sale.id}`}
                          checked={isSelected}
                          onChange={() => toggleSelectOne(sale.id)}
                          className="accent-primary size-4 cursor-pointer rounded"
                        />
                      ) : null}
                    </td>
                  ) : null}
                  <td className="py-3 pl-3 pr-3">
                    <div className="font-medium">
                      {sale.buyers?.full_name || "Sem nome"}
                    </div>
                    <div className="text-muted-foreground font-figures text-xs">
                      {sale.buyers?.phone}
                    </div>
                    {sale.isDuplicateProof ? (
                      <span
                        className="mt-1 inline-flex items-center gap-1 rounded-md bg-destructive/15 px-1.5 py-0.5 text-[11px] font-semibold text-destructive"
                        title="Atenção: este mesmo arquivo de comprovante já foi enviado em outra compra!"
                      >
                        🚨 Comprovante Repetido
                      </span>
                    ) : null}
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
                      {sale.payment_methods?.name || "PIX"}
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
                  {isAdmin ? (
                    <td className="py-3 pr-4 text-right">
                      <SaleRow
                        raffleId={raffleId}
                        saleId={sale.id}
                        status={sale.effectiveStatus}
                        attachmentId={sale.attachmentId}
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
    </div>
  );
}
