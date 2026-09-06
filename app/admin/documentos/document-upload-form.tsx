"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ATTACHMENT_KIND_LABELS, ATTACHMENT_KINDS } from "@/lib/uploads";

type Option = { id: string; label: string };

export function DocumentUploadForm({
  raffles,
  transactions,
}: {
  raffles: Option[];
  transactions: Option[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState<string>("documento");
  const [entityType, setEntityType] = useState<"" | "raffle" | "financial_transaction">("");
  const [entityId, setEntityId] = useState("");
  const [description, setDescription] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fileInput = formRef.current?.elements.namedItem("file") as HTMLInputElement | null;
    const file = fileInput?.files?.[0];
    if (!file) {
      toast.error("Selecione um arquivo.");
      return;
    }

    const body = new FormData();
    body.set("file", file);
    body.set("kind", kind);
    if (description.trim()) body.set("description", description.trim());
    if (entityType && entityId) {
      body.set("entityType", entityType);
      body.set("entityId", entityId);
    }

    startTransition(async () => {
      const res = await fetch("/api/uploads/documento", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Não foi possível enviar o documento.");
        return;
      }
      toast.success("Documento enviado.");
      formRef.current?.reset();
      setKind("documento");
      setEntityType("");
      setEntityId("");
      setDescription("");
      router.refresh();
    });
  }

  const entityOptions = entityType === "raffle" ? raffles : entityType === "financial_transaction" ? transactions : [];

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="grid gap-3 rounded-lg border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor="doc-file">
            Arquivo
          </label>
          <input
            id="doc-file"
            name="file"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="border-input h-9 rounded-lg border bg-transparent px-2.5 text-sm outline-none file:mr-2 file:h-full file:border-0 file:bg-transparent file:text-sm"
          />
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor="doc-kind">
            Tipo
          </label>
          <select
            id="doc-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="border-input h-9 rounded-lg border bg-transparent px-2.5 text-sm outline-none"
          >
            {ATTACHMENT_KINDS.filter((k) => k !== "comprovante").map((k) => (
              <option key={k} value={k}>
                {ATTACHMENT_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor="doc-entity-type">
            Vincular a
          </label>
          <select
            id="doc-entity-type"
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value as typeof entityType);
              setEntityId("");
            }}
            className="border-input h-9 rounded-lg border bg-transparent px-2.5 text-sm outline-none"
          >
            <option value="">Nenhum (documento avulso)</option>
            <option value="raffle">Rifa</option>
            <option value="financial_transaction">Lançamento financeiro</option>
          </select>
        </div>

        {entityType ? (
          <div className="grid gap-1">
            <label className="text-sm font-medium" htmlFor="doc-entity-id">
              {entityType === "raffle" ? "Rifa" : "Lançamento"}
            </label>
            <select
              id="doc-entity-id"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              className="border-input h-9 rounded-lg border bg-transparent px-2.5 text-sm outline-none"
            >
              <option value="">Selecione…</option>
              {entityOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <Input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Descrição (opcional)"
      />

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Enviando…" : "Enviar documento"}
        </Button>
      </div>
    </form>
  );
}
