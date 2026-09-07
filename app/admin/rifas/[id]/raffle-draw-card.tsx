"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { drawRaffleWinner, clearRaffleWinner } from "../actions";
import type { RaffleWinner } from "@/lib/settings";

export function RaffleDrawCard({
  raffleId,
  raffleStatus,
  winner,
  soldCount,
  isAdmin,
}: {
  raffleId: string;
  raffleStatus: string;
  winner: RaffleWinner | null;
  soldCount: number;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [drawMode, setDrawMode] = useState<"random" | "manual">("random");
  const [manualNumber, setManualNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [isDrawingAnimation, setIsDrawingAnimation] = useState(false);

  if (raffleStatus === "CANCELLED") return null;

  // Se já há um ganhador registrado
  if (winner) {
    const cleanPhone = winner.buyerPhone?.replace(/\D/g, "") ?? "";
    const whatsappUrl = cleanPhone ? `https://wa.me/55${cleanPhone}` : null;

    function handleClearWinner() {
      if (
        !window.confirm(
          "Tem certeza que deseja remover o ganhador atual?\n\nO resultado deixará de ser exibido na página pública da rifa e você poderá realizar um novo sorteio.",
        )
      ) {
        return;
      }

      startTransition(async () => {
        const res = await clearRaffleWinner(raffleId);
        if (res.error) {
          toast.error(res.error);
        } else {
          toast.success("Resultado do sorteio removido.");
          router.refresh();
        }
      });
    }

    return (
      <div className="mb-6 overflow-hidden rounded-xl border-2 border-amber-500/40 bg-gradient-to-br from-amber-500/10 via-background to-amber-500/5 p-5 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl" aria-hidden="true">
              🏆
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight text-amber-900 dark:text-amber-300">
                  Ganhador da Rifa
                </h2>
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                  Sorteio Concluído
                </span>
              </div>
              <p className="text-muted-foreground text-xs">
                Sorteio registrado no sistema e visível publicamente
              </p>
            </div>
          </div>

          {isAdmin ? (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={handleClearWinner}
              className="text-xs text-muted-foreground hover:text-destructive"
            >
              {pending ? "Removendo..." : "Refazer / Remover sorteio"}
            </Button>
          ) : null}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-amber-500/20 bg-card/60 p-3.5">
            <p className="label-tag text-muted-foreground">Número Sorteado</p>
            <p className="font-figures mt-1 text-2xl font-black text-amber-700 dark:text-amber-400">
              #{winner.pointNumber}
            </p>
          </div>

          <div className="rounded-lg border border-amber-500/20 bg-card/60 p-3.5 sm:col-span-2">
            <p className="label-tag text-muted-foreground">Nome do Ganhador</p>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
              <p className="text-lg font-semibold">{winner.buyerName}</p>
              {winner.buyerPhone ? (
                <div className="flex items-center gap-2">
                  <span className="font-figures text-muted-foreground text-sm">
                    {winner.buyerPhone}
                  </span>
                  {whatsappUrl ? (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-emerald-700"
                    >
                      <span>💬</span> WhatsApp
                    </a>
                  ) : null}
                </div>
              ) : (
                <span className="text-muted-foreground text-xs">Sem telefone registrado</span>
              )}
            </div>
          </div>
        </div>

        <div className="text-muted-foreground mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-amber-500/20 pt-3 text-xs">
          <span>
            Sorteado em:{" "}
            <strong className="text-foreground">
              {new Date(winner.drawnAt).toLocaleString("pt-BR")}
            </strong>
            {winner.drawnByName ? ` por ${winner.drawnByName}` : ""}
          </span>
          {winner.notes ? (
            <span className="italic">Obs: {winner.notes}</span>
          ) : null}
        </div>
      </div>
    );
  }

  // Se a rifa ainda está aberta
  if (raffleStatus === "OPEN") {
    return (
      <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-card/40 p-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">🎲</span>
          <span>
            O sorteio do bilhete premiado estará disponível assim que a rifa for <strong>encerrada</strong>.
          </span>
        </div>
      </div>
    );
  }

  // Rifa encerrada, pronta para sorteio
  if (!isAdmin) {
    return (
      <div className="mb-6 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        A rifa está encerrada. Aguardando a realização do sorteio pela administração.
      </div>
    );
  }

  function handleDraw() {
    if (soldCount === 0) {
      toast.error("Não há números vendidos nesta rifa para realizar o sorteio.");
      return;
    }

    let parsedManualNumber: number | undefined = undefined;
    if (drawMode === "manual") {
      const num = parseInt(manualNumber.trim(), 10);
      if (isNaN(num) || num < 0) {
        toast.error("Informe um número válido para o sorteio.");
        return;
      }
      parsedManualNumber = num;
    }

    if (
      !window.confirm(
        drawMode === "random"
          ? "Confirmar realização do sorteio aleatório entre todos os números vendidos?"
          : `Confirmar registro do número #${parsedManualNumber} como ganhador desta rifa?`,
      )
    ) {
      return;
    }

    setIsDrawingAnimation(true);

    startTransition(async () => {
      try {
        const res = await drawRaffleWinner(raffleId, parsedManualNumber, notes);
        setIsDrawingAnimation(false);

        if (res.error) {
          toast.error(res.error);
        } else if (res.winner) {
          toast.success(
            `🎉 Ganhador sorteado: #${res.winner.pointNumber} - ${res.winner.buyerName}!`,
          );
          router.refresh();
        }
      } catch {
        setIsDrawingAnimation(false);
        toast.error("Erro inesperado ao realizar o sorteio.");
      }
    });
  }

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-primary/30 bg-card p-5 shadow-xs">
      <div className="flex items-center gap-2.5">
        <span className="text-2xl" aria-hidden="true">
          🎲
        </span>
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            Realizar Sorteio da Rifa
          </h2>
          <p className="text-muted-foreground text-xs">
            A rifa está encerrada. Escolha como definir o bilhete vencedor.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setDrawMode("random")}
          className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors ${
            drawMode === "random"
              ? "border-primary bg-primary/10 text-primary font-semibold"
              : "border-border bg-background text-muted-foreground hover:text-foreground"
          }`}
        >
          <span>🎰</span> Sorteio Aleatório Automático
        </button>
        <button
          type="button"
          onClick={() => setDrawMode("manual")}
          className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors ${
            drawMode === "manual"
              ? "border-primary bg-primary/10 text-primary font-semibold"
              : "border-border bg-background text-muted-foreground hover:text-foreground"
          }`}
        >
          <span>✍️</span> Informar Número (Loteria Federal / Live)
        </button>
      </div>

      {drawMode === "random" ? (
        <div className="bg-secondary/40 text-muted-foreground mt-4 rounded-lg p-3 text-xs">
          O sistema selecionará aleatoriamente um número com status <strong>Vendido (Confirmado)</strong> entre os {soldCount} bilhetes participantes desta rifa.
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="manual-number" className="text-xs font-medium">
              Número Sorteado *
            </label>
            <Input
              id="manual-number"
              type="number"
              placeholder="Ex: 42"
              value={manualNumber}
              onChange={(e) => setManualNumber(e.target.value)}
              className="mt-1"
            />
            <p className="text-muted-foreground mt-1 text-[11px]">
              O número precisa ter sido vendido nesta rifa.
            </p>
          </div>
          <div>
            <label htmlFor="draw-notes" className="text-xs font-medium">
              Origem / Observação (Opcional)
            </label>
            <Input
              id="draw-notes"
              type="text"
              placeholder="Ex: Concurso 5892 Loteria Federal"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
      )}

      <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
        <span className="text-muted-foreground text-xs">
          Total de números concorrendo: <strong>{soldCount} vendidos</strong>
        </span>
        <Button
          onClick={handleDraw}
          disabled={pending || isDrawingAnimation || soldCount === 0}
          className="bg-primary hover:bg-primary/90 font-medium"
        >
          {isDrawingAnimation
            ? "Sorteando..."
            : drawMode === "random"
              ? "Sortear Agora"
              : "Registrar Ganhador"}
        </Button>
      </div>
    </div>
  );
}
