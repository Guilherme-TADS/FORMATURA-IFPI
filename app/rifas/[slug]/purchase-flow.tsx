"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { centsToBRL } from "@/lib/money";
import { buyerFormSchema, type SaleReceipt } from "@/lib/schemas/checkout";
import { generatePixPayload } from "@/lib/pix";
import type { PixInfo } from "@/lib/settings";
import { PixQrCode } from "@/components/pix-qr-code";
import { NumberGrid } from "./number-grid";
import { releaseReservation } from "./actions";

type PaymentMethod = { id: string | null; name: string | null };

const RESERVATION_STORAGE_KEY_PREFIX = "raffle-reservation:";

type StoredReservation = {
  token: string;
  reservedUntil: string;
  pointNumbers: number[];
  idempotencyKey: string;
};

export function PurchaseFlow({
  raffleId,
  raffleSlug,
  unitPriceCents,
  paymentMethods,
  reservationTtlMinutes,
  pixInfo,
  sellerName,
  mercadoPagoEnabled = false,
}: {
  raffleId: string;
  raffleSlug: string;
  unitPriceCents: number;
  paymentMethods: PaymentMethod[];
  reservationTtlMinutes: number;
  pixInfo?: PixInfo;
  sellerName?: string | null;
  mercadoPagoEnabled?: boolean;
}) {
  const router = useRouter();
  const storageKey = `${RESERVATION_STORAGE_KEY_PREFIX}${raffleId}`;

  const [selected, setSelected] = useState<number[]>([]);
  const [reservation, setReservation] = useState<StoredReservation | null>(null);
  const [gridRefreshKey, setGridRefreshKey] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [attachmentId, setAttachmentId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reserving, setReserving] = useState(false);
  const [cancellingReservation, setCancellingReservation] = useState(false);

  const [pixMode, setPixMode] = useState<"AUTOMATIC" | "MANUAL">(
    mercadoPagoEnabled && !sellerName ? "AUTOMATIC" : "MANUAL",
  );
  const [mpPayment, setMpPayment] = useState<{
    saleId: string;
    qrCode: string;
    qrCodeBase64: string;
    paymentId: number;
  } | null>(null);
  const [generatingMp, setGeneratingMp] = useState(false);
  const [checkingMpStatus, setCheckingMpStatus] = useState(false);
  const [copiedMpCode, setCopiedMpCode] = useState(false);

  const pixMethod = useMemo(() => {
    return (
      paymentMethods.find((m) => m.name?.toUpperCase() === "PIX") ??
      paymentMethods[0]
    );
  }, [paymentMethods]);

  const form = useForm({
    resolver: zodResolver(buyerFormSchema),
    defaultValues: {
      fullName: "",
      phone: "",
      whatsapp: "",
      instagram: "",
      email: "",
      notes: "",
      paymentMethodId: pixMethod?.id ?? "",
    },
  });

  useEffect(() => {
    if (pixMethod?.id && !form.getValues("paymentMethodId")) {
      form.setValue("paymentMethodId", pixMethod.id);
    }
  }, [pixMethod, form]);

  const totalCents = selected.length * unitPriceCents;

  const pixCode = useMemo(() => {
    if (!pixInfo?.key || !reservation) return "";
    return generatePixPayload({
      pixKey: pixInfo.key,
      merchantName: pixInfo.merchantName,
      merchantCity: pixInfo.merchantCity,
      amountCents: totalCents,
      txId: `RIFA${reservation.pointNumbers[0] ?? ""}`,
    });
  }, [pixInfo, reservation, totalCents]);

  // Resume an in-flight reservation across a page refresh instead of
  // silently orphaning it until the cron sweep releases it.
  useEffect(() => {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return;
    try {
      const stored: StoredReservation = JSON.parse(raw);
      if (new Date(stored.reservedUntil).getTime() > Date.now()) {
        // sessionStorage can't be read during SSR, so this one-time resume
        // check has to happen after mount.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setReservation(stored);
        setSelected(stored.pointNumbers);
      } else {
        sessionStorage.removeItem(storageKey);
      }
    } catch {
      sessionStorage.removeItem(storageKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!reservation) return;
    function tick() {
      const secs = Math.max(
        0,
        Math.round(
          (new Date(reservation!.reservedUntil).getTime() - Date.now()) / 1000,
        ),
      );
      setRemainingSeconds(secs);
      if (secs === 0) {
        toast.error("Sua reserva expirou. Selecione os números novamente.");
        setReservation(null);
        setSelected([]);
        setAttachmentId(null);
        sessionStorage.removeItem(storageKey);
        setGridRefreshKey((k) => k + 1);
      }
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [reservation, storageKey]);

  function toggleSelection(pointNumber: number) {
    setSelected((prev) =>
      prev.includes(pointNumber)
        ? prev.filter((n) => n !== pointNumber)
        : prev.length >= 50
          ? (toast.error("Selecione no máximo 50 números por vez."), prev)
          : [...prev, pointNumber],
    );
  }

  async function handleReserve() {
    if (selected.length === 0) {
      toast.error("Selecione ao menos um número.");
      return;
    }
    setReserving(true);
    const supabase = createClient();
    const token = crypto.randomUUID();

    // Libera oportunamente reservas que possam ter expirado
    await supabase.rpc("rpc_release_expired_reservations");

    const { data, error } = await supabase.rpc("rpc_reserve_points", {
      p_raffle_id: raffleId,
      p_point_numbers: selected,
      p_reservation_token: token,
      p_ttl_minutes: reservationTtlMinutes,
    });

    setReserving(false);

    if (error) {
      toast.error(error.message);
      setGridRefreshKey((k) => k + 1);
      return;
    }

    const reservedUntil = data?.[0]?.reserved_until as string;
    const stored: StoredReservation = {
      token,
      reservedUntil,
      pointNumbers: selected,
      idempotencyKey: crypto.randomUUID(),
    };
    sessionStorage.setItem(storageKey, JSON.stringify(stored));
    setReservation(stored);
  }

  async function handleCancelReservation() {
    if (!reservation) return;
    if (
      !window.confirm(
        "Deseja liberar estes números para outros compradores?",
      )
    ) {
      return;
    }
    setCancellingReservation(true);
    try {
      await releaseReservation(raffleId, raffleSlug, reservation.token);
      sessionStorage.removeItem(storageKey);
      setReservation(null);
      setSelected([]);
      setAttachmentId(null);
      setGridRefreshKey((k) => k + 1);
      toast.success("Números liberados com sucesso.");
    } catch {
      toast.error("Não foi possível liberar os números. Tente novamente.");
    } finally {
      setCancellingReservation(false);
    }
  }

  async function handleFileChange(file: File | null) {
    if (!file) {
      setAttachmentId(null);
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/uploads/comprovante", {
        method: "POST",
        body,
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Não foi possível enviar o comprovante.");
        setAttachmentId(null);
        return;
      }
      setAttachmentId(json.attachmentId);
      toast.success("Comprovante enviado.");
    } catch {
      toast.error("Não foi possível enviar o comprovante. Tente novamente.");
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(values: {
    fullName: string;
    phone: string;
    whatsapp?: string;
    instagram?: string;
    notes?: string;
    paymentMethodId: string;
  }) {
    if (!reservation) return;
    if (!sellerName && !attachmentId) {
      toast.error("Por favor, anexe o comprovante do PIX para continuar.");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("rpc_confirm_sale", {
      p_raffle_id: raffleId,
      p_reservation_token: reservation.token,
      p_buyer_full_name: values.fullName,
      p_buyer_phone: values.phone,
      p_buyer_whatsapp: values.whatsapp || "",
      p_buyer_instagram: values.instagram || "",
      p_buyer_notes: values.notes || "",
      p_payment_method_id: values.paymentMethodId,
      p_idempotency_key: reservation.idempotencyKey,
      p_attachment_id: attachmentId ?? undefined,
    });

    setSubmitting(false);

    if (error) {
      toast.error(error.message);
      if (/expirou|encerrada/i.test(error.message)) {
        setReservation(null);
        setSelected([]);
        sessionStorage.removeItem(storageKey);
        setGridRefreshKey((k) => k + 1);
      }
      return;
    }

    const receipt = data as SaleReceipt;
    const receiptWithStatus: SaleReceipt = {
      ...receipt,
      status: (receipt.status as SaleReceipt["status"]) ?? (sellerName ? "CONFIRMED" : "PENDING"),
    };
    sessionStorage.setItem(`receipt:${receipt.saleId}`, JSON.stringify(receiptWithStatus));
    sessionStorage.removeItem(storageKey);
    router.push(`/rifas/${raffleSlug}/confirmacao/${receipt.saleId}`);
  }

  useEffect(() => {
    if (!mpPayment?.saleId) return;
    let active = true;

    async function checkStatus() {
      try {
        const res = await fetch(
          `/api/mercadopago/status?saleId=${mpPayment!.saleId}&paymentId=${mpPayment!.paymentId}`,
        );
        const data = await res.json();
        if (data.status === "CONFIRMED" && active) {
          toast.success("🎉 Pagamento aprovado com sucesso!");
          const receipt: SaleReceipt = {
            saleId: mpPayment!.saleId,
            raffleTitle: "",
            buyerName: form.getValues("fullName"),
            pointNumbers: reservation?.pointNumbers ?? [],
            amountCents: totalCents,
            paymentMethod: "PIX Automático",
            status: "CONFIRMED",
            createdAt: new Date().toISOString(),
          };
          sessionStorage.setItem(`receipt:${mpPayment!.saleId}`, JSON.stringify(receipt));
          sessionStorage.removeItem(storageKey);
          router.push(`/rifas/${raffleSlug}/confirmacao/${mpPayment!.saleId}`);
        }
      } catch {
        // network polling issue
      }
    }

    const interval = setInterval(checkStatus, 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [mpPayment, form, reservation, totalCents, raffleSlug, storageKey, router]);

  async function handleStartMercadoPago() {
    const valid = await form.trigger(["fullName", "phone"]);
    if (!valid) return;
    if (!reservation) return;

    setGeneratingMp(true);
    try {
      const res = await fetch("/api/mercadopago/create-pix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raffleId,
          reservationToken: reservation.token,
          fullName: form.getValues("fullName"),
          phone: form.getValues("phone"),
          whatsapp: form.getValues("whatsapp"),
          instagram: form.getValues("instagram"),
          email: form.getValues("email"),
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        toast.error(data.error || "Não foi possível gerar a cobrança PIX.");
        return;
      }

      setMpPayment({
        saleId: data.saleId,
        qrCode: data.qrCode,
        qrCodeBase64: data.qrCodeBase64,
        paymentId: data.paymentId,
      });
      toast.success("Código PIX gerado! Pague pelo seu banco para confirmação instantânea.");
    } catch {
      toast.error("Erro de conexão ao gerar o PIX Automático.");
    } finally {
      setGeneratingMp(false);
    }
  }

  async function handleManualStatusCheck() {
    if (!mpPayment?.saleId) return;
    setCheckingMpStatus(true);
    try {
      const res = await fetch(
        `/api/mercadopago/status?saleId=${mpPayment.saleId}&paymentId=${mpPayment.paymentId}`,
      );
      const data = await res.json();
      if (data.status === "CONFIRMED") {
        toast.success("🎉 Pagamento confirmado com sucesso!");
        const receipt: SaleReceipt = {
          saleId: mpPayment.saleId,
          raffleTitle: "",
          buyerName: form.getValues("fullName"),
          pointNumbers: reservation?.pointNumbers ?? [],
          amountCents: totalCents,
          paymentMethod: "PIX Automático",
          status: "CONFIRMED",
          createdAt: new Date().toISOString(),
        };
        sessionStorage.setItem(`receipt:${mpPayment.saleId}`, JSON.stringify(receipt));
        sessionStorage.removeItem(storageKey);
        router.push(`/rifas/${raffleSlug}/confirmacao/${mpPayment.saleId}`);
      } else {
        toast.info("Pagamento ainda não detectado pelo banco. Se já realizou a transferência, aguarde alguns segundos.");
      }
    } catch {
      toast.error("Não foi possível verificar no momento.");
    } finally {
      setCheckingMpStatus(false);
    }
  }

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  const paymentOptions = useMemo(() => paymentMethods, [paymentMethods]);

  if (!reservation) {
    return (
      <div className="mt-8 pb-24">
        <h2 className="mb-3 text-lg font-semibold">Escolha seus números</h2>
        <NumberGrid
          raffleId={raffleId}
          selected={selected}
          onToggle={toggleSelection}
          refreshKey={gridRefreshKey}
        />
        <div className="bg-card ring-foreground/8 sticky bottom-3 mt-5 flex items-center justify-between gap-4 rounded-lg p-3.5 shadow-[0_4px_16px_-4px_oklch(0.3_0.02_85_/_0.25)] ring-1">
          <div>
            <p className="label-tag">
              {selected.length} selecionado{selected.length === 1 ? "" : "s"}
            </p>
            <p className="font-figures text-lg font-semibold">
              {centsToBRL(totalCents)}
            </p>
          </div>
          <Button
            size="lg"
            onClick={handleReserve}
            disabled={reserving || selected.length === 0}
          >
            {reserving ? "Reservando…" : "Reservar e continuar"}
          </Button>
        </div>
      </div>
    );
  }

  const urgent = remainingSeconds > 0 && remainingSeconds < 60;

  return (
    <div className="mt-8 max-w-md">
      <div
        className={cn(
          "mb-5 rounded-lg border p-3.5",
          urgent
            ? "border-void/40 bg-void-bg text-void"
            : "border-pending/40 bg-pending-bg text-pending",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="label-tag text-current opacity-80">
              Reservado · {reservation.pointNumbers.join(", ")}
            </p>
            <p className="font-figures text-sm font-semibold">
              {minutes}:{String(seconds).padStart(2, "0")} restantes
            </p>
          </div>
          <p className="font-figures text-lg font-semibold text-current">
            {centsToBRL(totalCents)}
          </p>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-current/15 pt-2.5">
          <span className="text-xs opacity-75">
            Deseja trocar ou desistir dos números?
          </span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={cancellingReservation || submitting}
            onClick={handleCancelReservation}
            className="hover:bg-current/10 hover:text-current font-medium text-xs underline"
          >
            {cancellingReservation ? "Liberando…" : "Liberar estes números"}
          </Button>
        </div>
      </div>

      {mpPayment ? (
        <div className="border-border bg-card grid gap-4 rounded-xl border p-5 shadow-sm">
          <div className="text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-confirmed-bg px-2.5 py-1 text-xs font-medium text-confirmed border border-confirmed/30">
              <span className="h-2 w-2 rounded-full bg-confirmed animate-ping" />
              PIX Gerado com Sucesso
            </span>
            <h3 className="mt-2 text-base font-semibold">Pague para Confirmar</h3>
            <p className="text-muted-foreground text-xs">
              Abra o app do seu banco e aponte a câmera para o QR Code ou copie o código Pix abaixo.
            </p>
          </div>

          {mpPayment.qrCodeBase64 ? (
            <div className="flex justify-center p-2 bg-white rounded-lg border border-border w-fit mx-auto shadow-inner">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/png;base64,${mpPayment.qrCodeBase64}`}
                alt="QR Code PIX Mercado Pago"
                className="h-48 w-48 object-contain"
              />
            </div>
          ) : null}

          {mpPayment.qrCode ? (
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Código Pix Copia e Cola:</label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={mpPayment.qrCode}
                  className="font-mono text-xs select-all bg-secondary/50"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(mpPayment.qrCode);
                    setCopiedMpCode(true);
                    toast.success("Código PIX copiado!");
                    setTimeout(() => setCopiedMpCode(false), 2500);
                  }}
                >
                  {copiedMpCode ? "Copiado!" : "Copiar"}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="border-border bg-secondary/40 rounded-lg border p-3 flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-pending animate-pulse shrink-0" />
            <div className="text-xs">
              <p className="font-medium text-foreground">Aguardando confirmação bancária...</p>
              <p className="text-muted-foreground text-[11px]">
                Assim que o pagamento for concluído no seu banco, esta tela atualizará automaticamente em instantes.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={checkingMpStatus}
              onClick={handleManualStatusCheck}
            >
              {checkingMpStatus ? "Verificando..." : "Já paguei! Verificar agora"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setMpPayment(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Trocar forma de pagamento
            </Button>
          </div>
        </div>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            {mercadoPagoEnabled && !sellerName ? (
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-secondary/50 p-1 mb-2 border border-border">
                <button
                  type="button"
                  onClick={() => setPixMode("AUTOMATIC")}
                  className={cn(
                    "flex flex-col items-center justify-center py-2 px-3 rounded-md transition-all text-xs font-semibold",
                    pixMode === "AUTOMATIC"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span>⚡ PIX Automático</span>
                  <span className="text-[10px] font-normal opacity-85">Instantâneo · Sem comprovante</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPixMode("MANUAL")}
                  className={cn(
                    "flex flex-col items-center justify-center py-2 px-3 rounded-md transition-all text-xs font-semibold",
                    pixMode === "MANUAL"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span>📄 PIX Manual</span>
                  <span className="text-[10px] font-normal opacity-85">Chave da Turma · Zero taxas</span>
                </button>
              </div>
            ) : null}

            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome completo</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefone</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="(11) 99999-9999" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mail (opcional)</FormLabel>
                  <FormControl>
                    <Input {...field} type="email" placeholder="seu@email.com" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="whatsapp"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>WhatsApp (opcional)</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="instagram"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Instagram (opcional)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="@usuario" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <input
              type="hidden"
              {...form.register("paymentMethodId")}
              value={pixMethod?.id ?? ""}
            />

            {pixMode === "AUTOMATIC" && !sellerName ? (
              <>
                <div className="border-border bg-secondary/30 rounded-lg border p-3.5 text-xs text-muted-foreground space-y-1">
                  <p className="font-semibold text-foreground flex items-center gap-1.5">
                    <span>⚡ Como funciona o PIX Automático:</span>
                  </p>
                  <p>
                    Ao clicar no botão abaixo, geraremos um QR Code dinâmico exclusivo do Banco Central. Assim que você pagar no app do seu banco, o sistema confirma seus números em poucos segundos de forma automática sem precisar enviar comprovante!
                  </p>
                </div>

                <Button
                  type="button"
                  size="lg"
                  disabled={generatingMp}
                  onClick={handleStartMercadoPago}
                >
                  {generatingMp ? "Gerando PIX..." : "Gerar PIX e Pagar"}
                </Button>
              </>
            ) : (
              <>
                <PixQrCode
                  code={pixCode}
                  amountCents={totalCents}
                  pixKey={pixInfo?.key}
                />

                <div className="border-border bg-secondary/40 grid gap-1.5 rounded-lg border border-dashed p-3.5">
                  <label className="text-sm font-medium">
                    Anexar comprovante do PIX {sellerName ? "(opcional para vendedor)" : "(obrigatório)"}
                  </label>
                  <p className="text-muted-foreground text-xs">
                    Após realizar o pagamento do valor exato, anexe o comprovante (foto ou PDF) abaixo para validação.
                  </p>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                    className="text-muted-foreground file:bg-card file:text-foreground file:border-border mt-1 text-xs file:mr-3 file:rounded-md file:border file:px-2.5 file:py-1.5 file:text-xs file:font-medium"
                  />
                  {uploading ? (
                    <p className="text-pending text-xs font-medium">Enviando comprovante…</p>
                  ) : null}
                  {attachmentId ? (
                    <p className="text-confirmed flex items-center gap-1 text-xs font-medium">
                      <span aria-hidden>✓</span> Comprovante anexado
                    </p>
                  ) : null}
                </div>

                <Button type="submit" size="lg" disabled={submitting || uploading}>
                  {submitting
                    ? "Processando…"
                    : sellerName
                      ? "Confirmar Venda (Vendedor)"
                      : "Confirmar Compra"}
                </Button>
              </>
            )}
          </form>
        </Form>
      )}
    </div>
  );
}
