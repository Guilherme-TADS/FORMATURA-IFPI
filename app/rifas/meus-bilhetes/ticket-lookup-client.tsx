"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { centsToBRL } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { searchBuyerTickets, type BuyerTicketSale } from "./actions";

export function TicketLookupClient() {
  const [phone, setPhone] = useState("");
  const [pending, startTransition] = useTransition();
  const [hasSearched, setHasSearched] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [buyerName, setBuyerName] = useState<string | null>(null);
  const [sales, setSales] = useState<BuyerTicketSale[]>([]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;

    setErrorMessage(null);
    startTransition(async () => {
      const res = await searchBuyerTickets(phone);
      setHasSearched(true);
      if (!res.found) {
        setErrorMessage(res.message || "Nenhum bilhete encontrado.");
        setSales([]);
        setBuyerName(null);
      } else {
        setBuyerName(res.buyerName ?? null);
        setSales(res.sales ?? []);
      }
    });
  }

  return (
    <div className="w-full">
      {/* Formulário de Busca */}
      <form
        onSubmit={handleSearch}
        className="rounded-xl border border-border bg-card p-5 shadow-xs"
      >
        <label htmlFor="phone-input" className="block text-sm font-semibold">
          Telefone com DDD
        </label>
        <p className="text-muted-foreground mt-1 text-xs">
          Digite o mesmo número de telefone ou WhatsApp informado durante a compra (com DDD).
        </p>

        <div className="mt-3 flex flex-wrap gap-2 sm:flex-nowrap">
          <Input
            id="phone-input"
            type="tel"
            placeholder="(86) 99999-9999"
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
            className="text-base sm:text-sm font-figures"
            maxLength={15}
            required
          />
          <Button
            type="submit"
            disabled={pending || phone.replace(/\D/g, "").length < 10}
            className="w-full sm:w-auto shrink-0"
          >
            {pending ? "Consultando..." : "Consultar Bilhetes"}
          </Button>
        </div>
      </form>

      {/* Resultados da Busca */}
      {hasSearched && (
        <div className="mt-8 space-y-4">
          {errorMessage ? (
            <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/10 p-5 text-center text-sm text-amber-900 dark:text-amber-200">
              <p className="font-semibold">{errorMessage}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                Dica: Certifique-se de preencher o DDD e o número completo. Caso tenha comprado diretamente com um formando, confirme o telefone registrado.
              </p>
            </div>
          ) : (
            <div>
              {buyerName ? (
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm font-medium">
                    Bilhetes encontrados para:{" "}
                    <strong className="text-foreground">{buyerName}</strong>
                  </p>
                  <span className="text-muted-foreground text-xs">
                    {sales.length} {sales.length === 1 ? "compra" : "compras"}
                  </span>
                </div>
              ) : null}

              <div className="space-y-4">
                {sales.map((sale) => (
                  <div
                    key={sale.saleId}
                    className="overflow-hidden rounded-xl border border-border bg-card shadow-xs transition-all hover:border-primary/40"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-muted/30 p-4">
                      <div>
                        <Link
                          href={`/rifas/${sale.raffleSlug}`}
                          className="font-semibold text-foreground hover:underline"
                        >
                          {sale.raffleTitle}
                        </Link>
                        <p className="font-figures text-muted-foreground text-xs">
                          Comprado em: {new Date(sale.createdAt).toLocaleString("pt-BR")}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {sale.status === "CONFIRMED" ? (
                          <Badge variant="confirmed" stamp>
                            Confirmado
                          </Badge>
                        ) : sale.status === "PENDING" ? (
                          <Badge variant="pending" stamp>
                            Aguardando conferência
                          </Badge>
                        ) : (
                          <Badge variant="void" stamp>
                            Cancelada
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="p-4 sm:p-5">
                      <div className="mb-3">
                        <p className="label-tag text-muted-foreground mb-1.5">
                          Seus Números ({sale.pointNumbers.length})
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {sale.pointNumbers.map((num) => (
                            <span
                              key={num}
                              className="font-figures inline-flex items-center justify-center rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1 text-sm font-bold text-primary"
                            >
                              #{num}
                            </span>
                          ))}
                        </div>
                      </div>

                      {sale.status === "PENDING" && (
                        <div className="bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20 rounded-lg p-3 text-xs mb-4">
                          ⏳ <strong>Comprovante em análise:</strong> A comissão de formatura está conferindo o seu comprovante de pagamento. Assim que aprovado, seu status mudará para Confirmado.
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-border pt-3">
                        <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
                          <span>Total:</span>
                          <span className="font-figures text-foreground font-semibold text-sm">
                            {centsToBRL(sale.amountCents)}
                          </span>
                          <span>({sale.paymentMethod})</span>
                        </div>

                        <Link
                          href={`/rifas/${sale.raffleSlug}/confirmacao/${sale.saleId}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          Ver comprovante completo ›
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
