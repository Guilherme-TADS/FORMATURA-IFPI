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
}: {
  raffleId: string;
  raffleSlug: string;
  unitPriceCents: number;
  paymentMethods: PaymentMethod[];
  reservationTtlMinutes: number;
  pixInfo?: PixInfo;
  sellerName?: string | null;
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
      notes: "",
      paymentMethodId: pixMethod?.id ?? "",
    },
  });

  useEffect(() => {
    if (pixMethod?.id && !form.getValues("paymentMethodId")) {
      form.setValue("paymentMethodId", pixMethod.id);
    }
  }, [pixMethod, form]);

  const [copied, setCopied] = useState(false);
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

  function handleCopyPix() {
    const textToCopy = pixCode || pixInfo?.key;
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    toast.success(pixCode ? "Código Pix Copia e Cola copiado!" : "Chave Pix copiada!");
    setTimeout(() => setCopied(false), 3000);
  }

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

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
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

          <input
            type="hidden"
            {...form.register("paymentMethodId")}
            value={pixMethod?.id ?? ""}
          />

          <div className="border-border bg-secondary/60 grid gap-3 rounded-lg border border-dashed p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Pagamento via PIX</p>
              <span className="text-confirmed text-xs font-medium">✓ Forma exclusiva</span>
            </div>
            <p className="text-muted-foreground text-xs mt-0.5">
              {pixCode
                ? "Copie o código abaixo e cole no seu banco na opção 'Pix Copia e Cola'. O valor exato já vem preenchido!"
                : pixInfo?.key
                ? `Faça a transferência para a chave Pix: ${pixInfo.key}`
                : "Chave Pix a ser informada pela comissão. Entre em contato se necessário."}
            </p>

            {pixCode || pixInfo?.key ? (
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={pixCode || pixInfo?.key}
                  className="font-mono text-xs bg-background select-all"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyPix}
                  className="shrink-0"
                >
                  {copied ? "Copiado! ✓" : "Copiar Código"}
                </Button>
              </div>
            ) : null}

            <div className="receipt-divider pt-2 grid gap-1.5">
              <label className="text-sm font-medium">
                Anexar comprovante do PIX {sellerName ? "(opcional para vendedor)" : "(obrigatório)"}
              </label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                className="text-muted-foreground file:bg-card file:text-foreground file:border-border text-xs file:mr-3 file:rounded-md file:border file:px-2.5 file:py-1.5 file:text-xs file:font-medium"
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
          </div>

          <Button type="submit" size="lg" disabled={submitting || uploading}>
            {submitting
              ? "Processando…"
              : sellerName
                ? "Confirmar Venda (Vendedor)"
                : "Confirmar Compra"}
          </Button>
        </form>
      </Form>
    </div>
  );
}
