"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { centsToBRL } from "@/lib/money";
import { updateTransaction, deleteTransaction } from "./actions";

type Category = { id: string; name: string | null };

export function TransactionRow({
  id,
  description,
  categoryId,
  categoryName,
  supplierName,
  amountCents,
  occurredOn,
  categories,
}: {
  id: string;
  description: string;
  categoryId: string | null;
  categoryName: string | null;
  supplierName?: string | null;
  amountCents: number;
  occurredOn: string;
  categories: Category[];
}) {
  const columnCount = supplierName === undefined ? 5 : 6;
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [pending, startTransition] = useTransition();

  const [editDescription, setEditDescription] = useState(description);
  const [editCategoryId, setEditCategoryId] = useState(categoryId ?? "");
  const [editAmount, setEditAmount] = useState((amountCents / 100).toFixed(2).replace(".", ","));
  const [editDate, setEditDate] = useState(occurredOn);
  const [reason, setReason] = useState("");
  const [deleteReason, setDeleteReason] = useState("");

  function handleSaveEdit() {
    if (reason.trim().length < 3) {
      toast.error("Informe o motivo da alteração.");
      return;
    }
    startTransition(async () => {
      const result = await updateTransaction(id, {
        description: editDescription,
        categoryId: editCategoryId,
        amountLabel: editAmount,
        occurredOn: editDate,
        reason: reason.trim(),
      });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Lançamento atualizado.");
      setMode("view");
      router.refresh();
    });
  }

  function handleDelete() {
    if (deleteReason.trim().length < 3) {
      toast.error("Informe o motivo da exclusão.");
      return;
    }
    startTransition(async () => {
      try {
        await deleteTransaction(id, deleteReason.trim());
        toast.success("Lançamento excluído.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao excluir.");
      }
    });
  }

  if (mode === "edit") {
    return (
      <tr className="border-border border-b border-dashed">
        <td colSpan={columnCount} className="py-3">
          <div className="border-border bg-secondary/50 grid gap-2 rounded-lg border border-dashed p-3">
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Descrição"
              />
              <select
                value={editCategoryId}
                onChange={(e) => setEditCategoryId(e.target.value)}
                className="border-input h-8 rounded-lg border bg-transparent px-2.5 text-sm outline-none"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Input
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                placeholder="Valor"
              />
              <Input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
              />
            </div>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motivo da alteração (obrigatório)"
            />
            <div className="flex gap-2">
              <Button size="sm" disabled={pending} onClick={handleSaveEdit}>
                Salvar
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => setMode("view")}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </td>
      </tr>
    );
  }

  if (mode === "delete") {
    return (
      <tr className="border-border border-b border-dashed">
        <td colSpan={columnCount} className="py-3">
          <div className="border-void/40 bg-void-bg grid gap-2 rounded-lg border p-3">
            <Input
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="Motivo da exclusão (obrigatório)"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                disabled={pending}
                onClick={handleDelete}
              >
                Confirmar exclusão
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => setMode("view")}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-border border-b border-dashed last:border-0">
      <td className="py-2.5 pr-4">{description}</td>
      <td className="py-2.5 pr-4">{categoryName ?? "—"}</td>
      {supplierName !== undefined ? (
        <td className="py-2.5 pr-4">{supplierName ?? "—"}</td>
      ) : null}
      <td className="font-figures py-2.5 pr-4">{centsToBRL(amountCents)}</td>
      <td className="font-figures py-2.5 pr-4">
        {new Date(occurredOn + "T00:00:00").toLocaleDateString("pt-BR")}
      </td>
      <td className="py-2.5 pr-4">
        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={() => setMode("edit")}>
            Editar
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setMode("delete")}>
            Excluir
          </Button>
        </div>
      </td>
    </tr>
  );
}
