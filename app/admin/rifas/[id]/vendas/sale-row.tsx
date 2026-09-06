"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function SaleRow({ saleId, status }: { saleId: string; status: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  if (status !== "CONFIRMED") return null;

  function handleCancel() {
    if (reason.trim().length < 3) {
      toast.error("Informe o motivo do cancelamento.");
      return;
    }
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.rpc("rpc_cancel_sale", {
        p_sale_id: saleId,
        p_reason: reason.trim(),
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Venda cancelada.");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        Cancelar
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Motivo"
        className="border-input h-7 w-32 rounded-md border bg-transparent px-2 text-xs outline-none"
      />
      <Button
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={handleCancel}
      >
        Confirmar
      </Button>
    </div>
  );
}
