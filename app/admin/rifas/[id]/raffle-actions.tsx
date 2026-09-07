"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { closeRaffle, cancelRaffle, deleteRaffle } from "../actions";

export function RaffleActions({
  raffleId,
  status,
  canDelete = false,
  raffleTitle,
}: {
  raffleId: string;
  status: string;
  canDelete?: boolean;
  raffleTitle?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");

  function handleDelete() {
    const confirmation = window.confirm(
      `Tem certeza que deseja excluir permanentemente a rifa "${raffleTitle || ""}"?\n\nEsta ação apagará a rifa e todos os números gerados. Esta ação NÃO pode ser desfeita.`,
    );
    if (!confirmation) return;

    startTransition(async () => {
      try {
        await deleteRaffle(raffleId);
        toast.success("Rifa excluída com sucesso.");
        router.push("/admin/rifas");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Erro ao excluir a rifa.",
        );
      }
    });
  }

  function handleClose() {
    if (
      !window.confirm(
        "Tem certeza que deseja encerrar esta rifa?\n\nNovas compras serão bloqueadas definitivamente para a realização do sorteio.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        await closeRaffle(raffleId);
        toast.success("Rifa encerrada.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao encerrar a rifa.");
      }
    });
  }

  function handleCancel() {
    if (reason.trim().length < 3) {
      toast.error("Informe o motivo do cancelamento.");
      return;
    }
    startTransition(async () => {
      try {
        await cancelRaffle(raffleId, reason.trim());
        toast.success("Rifa cancelada.");
        setCancelling(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao cancelar a rifa.");
      }
    });
  }

  if (status === "CANCELLED" && !canDelete) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {status === "OPEN" ? (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={handleClose}
          >
            Encerrar rifa
          </Button>
        ) : null}
        {status === "OPEN" ? (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => setCancelling((v) => !v)}
          >
            {cancelling ? "Fechar cancelamento" : "Cancelar rifa"}
          </Button>
        ) : null}
        {canDelete ? (
          <Button
            variant="destructive"
            size="sm"
            disabled={pending}
            onClick={handleDelete}
            title="Excluir rifa permanentemente (disponível pois não há vendas)"
          >
            Excluir rifa
          </Button>
        ) : null}
      </div>
      {cancelling ? (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <label htmlFor="cancel-reason" className="text-sm font-medium">
            Motivo do cancelamento
          </label>
          <textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="border-input w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm outline-none"
          />
          <div>
            <Button
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={handleCancel}
            >
              Confirmar cancelamento
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
