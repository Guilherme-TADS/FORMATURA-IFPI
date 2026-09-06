"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { approveSale, cancelSale, getAttachmentViewUrl } from "./actions";

export function SaleRow({
  raffleId,
  saleId,
  status,
  attachmentId,
  cancelledReason,
}: {
  raffleId: string;
  saleId: string;
  status: string;
  attachmentId?: string | null;
  cancelledReason?: string | null;
}) {
  const router = useRouter();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [loadingProof, setLoadingProof] = useState(false);
  const [pending, startTransition] = useTransition();

  async function handleViewProof() {
    if (!attachmentId) return;
    setLoadingProof(true);
    try {
      const res = await getAttachmentViewUrl(attachmentId);
      if (res.error || !res.url) {
        toast.error(res.error || "Não foi possível abrir o comprovante.");
        return;
      }
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Erro ao abrir comprovante.");
    } finally {
      setLoadingProof(false);
    }
  }

  function handleApprove() {
    startTransition(async () => {
      const res = await approveSale(raffleId, saleId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Venda aprovada com sucesso!");
      router.refresh();
    });
  }

  function handleCancelSubmit() {
    if (reason.trim().length < 3) {
      toast.error("Informe o motivo do cancelamento.");
      return;
    }
    startTransition(async () => {
      const res = await cancelSale(raffleId, saleId, reason);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(status === "PENDING" ? "Venda recusada e números liberados." : "Venda cancelada e números liberados.");
      setCancelOpen(false);
      setReason("");
      router.refresh();
    });
  }

  if (status === "CANCELLED") {
    return (
      <div className="flex items-center gap-2">
        {attachmentId && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleViewProof}
            disabled={loadingProof}
            className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
            title="Ver comprovante anexado"
          >
            {loadingProof ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            Comprovante
          </Button>
        )}
        {cancelledReason && (
          <span className="text-xs text-muted-foreground italic truncate max-w-[140px]" title={`Motivo: ${cancelledReason}`}>
            {cancelledReason}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Botão de Ver Comprovante */}
      {attachmentId && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleViewProof}
          disabled={loadingProof}
          className="h-7 gap-1 px-2 text-xs"
          title="Abrir comprovante de pagamento"
        >
          {loadingProof ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> : <FileText className="h-3.5 w-3.5 text-primary" />}
          Comprovante
        </Button>
      )}

      {/* Ações para Venda PENDENTE */}
      {status === "PENDING" && (
        <>
          {!cancelOpen ? (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={handleApprove}
                className="h-7 gap-1 px-2.5 text-xs bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 border-emerald-500/30 dark:text-emerald-400 dark:border-emerald-500/40"
                title="Aprovar pagamento e confirmar venda"
              >
                {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Aprovar
              </Button>

              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => setCancelOpen(true)}
                className="h-7 gap-1 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                title="Recusar venda e liberar números"
              >
                <X className="h-3.5 w-3.5" />
                Recusar
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-1">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Motivo da recusa..."
                className="border-input h-7 w-32 rounded-md border bg-transparent px-2 text-xs outline-none"
                autoFocus
              />
              <Button
                variant="destructive"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={pending}
                onClick={handleCancelSubmit}
              >
                Confirmar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-1.5 text-xs"
                onClick={() => {
                  setCancelOpen(false);
                  setReason("");
                }}
              >
                ✕
              </Button>
            </div>
          )}
        </>
      )}

      {/* Ações para Venda CONFIRMADA */}
      {status === "CONFIRMED" && (
        <>
          {!cancelOpen ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCancelOpen(true)}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
              title="Cancelar venda e liberar números"
            >
              Cancelar
            </Button>
          ) : (
            <div className="flex items-center gap-1">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Motivo do cancelamento..."
                className="border-input h-7 w-36 rounded-md border bg-transparent px-2 text-xs outline-none"
                autoFocus
              />
              <Button
                variant="destructive"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={pending}
                onClick={handleCancelSubmit}
              >
                Confirmar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-1.5 text-xs"
                onClick={() => {
                  setCancelOpen(false);
                  setReason("");
                }}
              >
                ✕
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
