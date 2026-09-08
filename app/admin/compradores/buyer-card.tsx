"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  Phone,
  MessageSquare,
  AtSign,
  FileText,
  ShoppingBag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { centsToBRL } from "@/lib/money";
import { updateBuyer, deleteBuyer } from "./actions";

export type BuyerSale = {
  id: string;
  amount_cents: number;
  status: string;
  created_at: string;
  raffle_title?: string;
  points?: number[];
};

export type BuyerData = {
  id: string;
  fullName: string;
  phone: string;
  whatsapp: string | null;
  instagram: string | null;
  notes: string | null;
  createdAt: string;
  sales: BuyerSale[];
};

export function BuyerCard({
  buyer,
  isAdmin,
}: {
  buyer: BuyerData;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Form states
  const [fullName, setFullName] = useState(buyer.fullName);
  const [phone, setPhone] = useState(buyer.phone);
  const [whatsapp, setWhatsapp] = useState(buyer.whatsapp ?? "");
  const [instagram, setInstagram] = useState(buyer.instagram ?? "");
  const [notes, setNotes] = useState(buyer.notes ?? "");

  const salesCount = buyer.sales.length;
  const confirmedSales = buyer.sales.filter((s) => s.status === "CONFIRMED");
  const pendingSales = buyer.sales.filter((s) => s.status === "PENDING");
  const totalSpent = confirmedSales.reduce((sum, s) => sum + s.amount_cents, 0);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await updateBuyer(buyer.id, {
          fullName,
          phone,
          whatsapp: whatsapp || undefined,
          instagram: instagram || undefined,
          notes: notes || undefined,
        });
        toast.success("Dados do comprador atualizados com sucesso.");
        setIsEditing(false);
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : "Erro ao atualizar dados do comprador.",
        );
      }
    });
  }

  function handleDelete() {
    if (salesCount > 0) {
      toast.error(
        "Este comprador possui compras registradas e não pode ser excluído.",
      );
      return;
    }

    if (
      !window.confirm(
        `Tem certeza que deseja excluir o cadastro de "${buyer.fullName}"?`,
      )
    ) {
      return;
    }

    startTransition(async () => {
      try {
        await deleteBuyer(buyer.id);
        toast.success("Comprador excluído com sucesso.");
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : "Erro ao excluir comprador.",
        );
      }
    });
  }

  return (
    <div className="border-border bg-card rounded-lg border p-4 transition-all">
      {isEditing ? (
        <form onSubmit={handleSave} className="grid gap-3">
          <div className="flex items-center justify-between border-b pb-2">
            <h3 className="text-sm font-semibold">Editar Comprador</h3>
            <span className="text-muted-foreground text-xs font-mono">
              ID: {buyer.id.slice(0, 8)}…
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium">Nome Completo *</label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="mt-1 h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium">Telefone *</label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="mt-1 h-8 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium">WhatsApp</label>
              <Input
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="(86) 99999-9999"
                className="mt-1 h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium">Instagram</label>
              <Input
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="@usuario"
                className="mt-1 h-8 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium">Observações / Notas</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: Amigo do formando Fulano"
              className="mt-1 h-8 text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                setFullName(buyer.fullName);
                setPhone(buyer.phone);
                setWhatsapp(buyer.whatsapp ?? "");
                setInstagram(buyer.instagram ?? "");
                setNotes(buyer.notes ?? "");
                setIsEditing(false);
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Salvando…" : "Salvar Alterações"}
            </Button>
          </div>
        </form>
      ) : (
        <div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold">{buyer.fullName}</h3>
                <Badge variant={salesCount > 0 ? "confirmed" : "outline"} stamp>
                  {salesCount === 1 ? "1 compra" : `${salesCount} compras`}
                </Badge>
              </div>

              <div className="text-muted-foreground font-figures mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="flex items-center gap-1">
                  <Phone className="size-3" />
                  {buyer.phone}
                </span>
                {buyer.whatsapp ? (
                  <span className="flex items-center gap-1">
                    <MessageSquare className="size-3 text-emerald-500" />
                    {buyer.whatsapp}
                  </span>
                ) : null}
                {buyer.instagram ? (
                  <span className="flex items-center gap-1">
                    <AtSign className="size-3 text-pink-500" />
                    {buyer.instagram}
                  </span>
                ) : null}
                <span suppressHydrationWarning className="opacity-75">
                  Cadastrado em {new Date(buyer.createdAt).toLocaleDateString("pt-BR")}
                </span>
              </div>

              {buyer.notes ? (
                <p className="text-muted-foreground mt-2 flex items-center gap-1 text-xs italic">
                  <FileText className="size-3 shrink-0" />
                  {buyer.notes}
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-1.5">
              {salesCount > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => setShowHistory((v) => !v)}
                  className="gap-1 text-xs"
                >
                  <ShoppingBag className="size-3" />
                  {showHistory ? "Ocultar compras" : "Ver compras"}
                  {showHistory ? (
                    <ChevronUp className="size-3" />
                  ) : (
                    <ChevronDown className="size-3" />
                  )}
                </Button>
              ) : null}

              {isAdmin ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={pending}
                    onClick={() => setIsEditing(true)}
                    className="gap-1 text-xs"
                  >
                    <Pencil className="size-3" />
                    Editar
                  </Button>

                  {salesCount === 0 ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="xs"
                      disabled={pending}
                      onClick={handleDelete}
                      title="Excluir cadastro do comprador"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>

          {showHistory && salesCount > 0 ? (
            <div className="border-border bg-muted/30 mt-3 rounded-md border p-3">
              <div className="mb-2 flex items-center justify-between text-xs font-semibold">
                <span>Histórico de Compras</span>
                <span className="font-figures text-emerald-600 dark:text-emerald-400">
                  Total confirmado: {centsToBRL(totalSpent)}
                  {pendingSales.length > 0 ? (
                    <span className="text-amber-600 dark:text-amber-400 font-normal ml-1">
                      ({pendingSales.length} em análise)
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="grid gap-2">
                {buyer.sales.map((s) => (
                  <div
                    key={s.id}
                    className="border-border bg-card flex flex-wrap items-center justify-between gap-2 rounded border px-2.5 py-1.5 text-xs"
                  >
                    <div>
                      <span className="font-medium">
                        {s.raffle_title ?? "Rifa"}
                      </span>
                      {s.points && s.points.length > 0 ? (
                        <span className="text-muted-foreground ml-2">
                          Números:{" "}
                          <strong className="text-foreground">
                            {s.points.join(", ")}
                          </strong>
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-figures font-medium">
                        {centsToBRL(s.amount_cents)}
                      </span>
                      <Badge
                        variant={
                          s.status === "CONFIRMED"
                            ? "confirmed"
                            : s.status === "PENDING"
                              ? "outline"
                              : "void"
                        }
                        className={
                          s.status === "PENDING"
                            ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                            : undefined
                        }
                        stamp
                      >
                        {s.status === "CONFIRMED"
                          ? "Confirmada"
                          : s.status === "PENDING"
                            ? "Pendente"
                            : "Cancelada"}
                      </Badge>
                      <span suppressHydrationWarning className="text-muted-foreground font-figures text-[11px]">
                        {new Date(s.created_at).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
