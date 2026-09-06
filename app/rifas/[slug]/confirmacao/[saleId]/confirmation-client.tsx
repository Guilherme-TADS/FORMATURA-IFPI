"use client";

import { use, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { centsToBRL } from "@/lib/money";
import type { SaleReceipt } from "@/lib/schemas/checkout";
import { fetchSaleReceipt } from "./actions";

function ReceiptRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="receipt-divider flex items-baseline justify-between gap-4 py-2.5 first:border-t-0 first:pt-0">
      <dt className="label-tag shrink-0">{label}</dt>
      <dd className={mono ? "font-figures text-right font-medium" : "text-right font-medium"}>
        {value}
      </dd>
    </div>
  );
}

export function ConfirmationClient({
  params,
}: {
  params: Promise<{ slug: string; saleId: string }>;
}) {
  const { slug, saleId } = use(params);
  const [receipt, setReceipt] = useState<SaleReceipt | null | undefined>(
    undefined,
  );

  useEffect(() => {
    const raw = sessionStorage.getItem(`receipt:${saleId}`);
    if (raw) {
      try {
        setReceipt(JSON.parse(raw));
        return;
      } catch {
        // Falha no parse, tenta buscar no servidor
      }
    }

    let isMounted = true;
    fetchSaleReceipt(saleId, slug).then((serverReceipt) => {
      if (!isMounted) return;
      if (serverReceipt) {
        sessionStorage.setItem(`receipt:${saleId}`, JSON.stringify(serverReceipt));
        setReceipt(serverReceipt);
      } else {
        setReceipt(null);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [saleId, slug]);

  function copyToClipboard() {
    if (!receipt) return;
    const text = [
      `Rifa: ${receipt.raffleTitle}`,
      `Comprador: ${receipt.buyerName}`,
      `Números: ${receipt.pointNumbers.join(", ")}`,
      `Valor: ${centsToBRL(receipt.amountCents)}`,
      `Forma de pagamento: ${receipt.paymentMethod}`,
    ].join("\n");
    navigator.clipboard.writeText(text);
    toast.success("Copiado para a área de transferência.");
  }

  if (receipt === undefined) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center p-6 text-center">
        <p className="text-muted-foreground text-sm">Carregando dados do comprovante…</p>
      </main>
    );
  }

  if (receipt === null) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center p-6 text-center">
        <h1 className="text-xl font-semibold">Comprovante não encontrado</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Não foi possível carregar os detalhes desta compra. Se você concluiu o pagamento recentemente, os dados foram gravados com sucesso.
        </p>
        <LinkButton className="mt-6" href={`/rifas/${slug}`}>
          Voltar para a rifa
        </LinkButton>
      </main>
    );
  }

  return (
    <main className="bg-secondary/60 mx-auto flex w-full flex-1 flex-col items-center p-6 print:bg-white print:p-0">
      <div className="animate-receipt-feed w-full max-w-sm">
        <div className="bg-card ring-foreground/8 relative rounded-lg p-6 shadow-[0_1px_2px_oklch(0.3_0.02_85_/_0.08),0_16px_32px_-16px_oklch(0.3_0.02_85_/_0.28)] ring-1 print:shadow-none print:ring-0">
          <div className="flex flex-col items-center text-center">
            {receipt.status === "PENDING" ? (
              <span
                className="stamp text-amber-600 dark:text-amber-400 animate-stamp-in border-amber-600 dark:border-amber-400 text-sm"
                style={{ animationDelay: "0.35s" }}
              >
                ⏳ Aguardando Conferência
              </span>
            ) : (
              <span
                className="stamp text-confirmed animate-stamp-in border-confirmed text-sm"
                style={{ animationDelay: "0.35s" }}
              >
                ✓ Confirmado
              </span>
            )}
            <h1 className="mt-3 text-lg font-semibold text-balance">
              {receipt.raffleTitle}
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {receipt.status === "PENDING"
                ? "Recebemos seu pedido! Seus números estão reservados com exclusividade enquanto a comissão confere o pagamento."
                : "Guarde esta confirmação — ela é o seu comprovante."}
            </p>
          </div>

          <div className="mt-5 flex flex-col items-center border-y border-dashed border-border py-4">
            <span className="label-tag">{receipt.status === "PENDING" ? "Valor a conferir" : "Valor pago"}</span>
            <span className="font-figures mt-1 text-3xl font-semibold">
              {centsToBRL(receipt.amountCents)}
            </span>
          </div>

          <dl className="mt-1">
            <ReceiptRow label="Comprador" value={receipt.buyerName} />
            <ReceiptRow
              label="Números"
              value={receipt.pointNumbers.join(", ")}
              mono
            />
            <ReceiptRow label="Pagamento" value={receipt.paymentMethod} />
            <ReceiptRow
              label="Status"
              value={receipt.status === "PENDING" ? "Pendente de conferência" : "Confirmado"}
            />
            <ReceiptRow
              label="Data"
              value={new Date(receipt.createdAt).toLocaleString("pt-BR")}
              mono
            />
            <ReceiptRow
              label="Comprovante nº"
              value={receipt.saleId.slice(0, 8).toUpperCase()}
              mono
            />
          </dl>

          {/* Perforated tear-line, the receipt's own edge motif. */}
          <div
            aria-hidden
            className="border-border pointer-events-none absolute inset-x-6 -bottom-3 border-t border-dashed print:hidden"
          />
        </div>

        <div className="mt-6 flex gap-2 print:hidden">
          <Button variant="outline" className="flex-1" onClick={copyToClipboard}>
            Copiar
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => window.print()}>
            Imprimir
          </Button>
        </div>

        <LinkButton className="mt-3 w-full print:hidden" href={`/rifas/${slug}`}>
          Voltar para a rifa
        </LinkButton>
      </div>
    </main>
  );
}
