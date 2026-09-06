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
import { NumberGrid } from "./number-grid";

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
}: {
  raffleId: string;
  raffleSlug: string;
  unitPriceCents: number;
  paymentMethods: PaymentMethod[];
  reservationTtlMinutes: number;
}) {
  const router = useRouter();
  const storageKey = `${RESERVATION_STORAGE_KEY_PREFIX}${raffleId}`;

  const [selected, setSelected] = useState<number[]>([]);
  const [reservation, setReservation] = useState<StoredReservation | null>(null);
  const [gridRefreshKey, setGridRefreshKey] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [attachmentId, setAttachmentId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cashConfirmed, setCashConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reserving, setReserving] = useState(false);

  const form = useForm({
    resolver: zodResolver(buyerFormSchema),
    defaultValues: {
      fullName: "",
      phone: "",
      whatsapp: "",
      instagram: "",
      notes: "",
      paymentMethodId: "",
    },
  });

  const watchedPaymentMethodId = useWatch({
    control: form.control,
    name: "paymentMethodId",
  });
  const selectedPaymentMethod = paymentMethods.find(
    (m) => m.id === watchedPaymentMethodId,
  );
  const isPix = selectedPaymentMethod?.name?.toUpperCase() === "PIX";

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

  const totalCents = selected.length * unitPriceCents;

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
    if (isPix && !attachmentId) {
      toast.error("Anexe o comprovante do PIX para continuar.");
      return;
    }
    if (!isPix && !cashConfirmed) {
      toast.error("Confirme que fará o pagamento em mãos.");
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
    sessionStorage.setItem(`receipt:${receipt.saleId}`, JSON.stringify(receipt));
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
          "mb-5 flex items-center justify-between gap-3 rounded-lg border p-3.5",
          urgent
            ? "border-void/40 bg-void-bg text-void"
            : "border-pending/40 bg-pending-bg text-pending",
        )}
      >
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

          <FormField
            control={form.control}
            name="paymentMethodId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Forma de pagamento</FormLabel>
                <FormControl>
                  <select
                    {...field}
                    className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3"
                  >
                    <option value="">Selecione…</option>
                    {paymentOptions.map((m) => (
                      <option key={m.id} value={m.id ?? ""}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {isPix ? (
            <div className="border-border bg-secondary/60 grid gap-2 rounded-lg border border-dashed p-3.5">
              <label className="text-sm font-medium">Comprovante do PIX</label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                className="text-muted-foreground file:bg-card file:text-foreground file:border-border text-xs file:mr-3 file:rounded-md file:border file:px-2.5 file:py-1.5 file:text-xs file:font-medium"
              />
              {uploading ? (
                <p className="text-pending text-xs font-medium">Enviando…</p>
              ) : null}
              {attachmentId ? (
                <p className="text-confirmed flex items-center gap-1 text-xs font-medium">
                  <span aria-hidden>✓</span> Comprovante anexado
                </p>
              ) : null}
            </div>
          ) : selectedPaymentMethod ? (
            <label className="border-border bg-secondary/60 flex items-start gap-2.5 rounded-lg border border-dashed p-3.5 text-sm">
              <input
                type="checkbox"
                checked={cashConfirmed}
                onChange={(e) => setCashConfirmed(e.target.checked)}
                className="accent-primary mt-0.5"
              />
              Confirmo que farei o pagamento em mãos com a comissão.
            </label>
          ) : null}

          <Button type="submit" size="lg" disabled={submitting || uploading}>
            {submitting ? "Finalizando…" : "Finalizar registro"}
          </Button>
        </form>
      </Form>
    </div>
  );
}
