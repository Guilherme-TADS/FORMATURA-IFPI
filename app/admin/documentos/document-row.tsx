"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ATTACHMENT_KIND_LABELS, ATTACHMENT_STATUS_LABELS } from "@/lib/uploads";
import { getDownloadUrl, linkAttachment, updateAttachmentDescription } from "./actions";

type Option = { id: string; label: string };

export function DocumentRow({
  id,
  fileName,
  fileSize,
  kind,
  status,
  description,
  entityType,
  entityId,
  entityLabel,
  uploadedByName,
  uploadedAt,
  isAdmin,
  raffles,
  transactions,
}: {
  id: string;
  fileName: string;
  fileSize: number;
  kind: string;
  status: string;
  description: string | null;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  uploadedByName: string | null;
  uploadedAt: string;
  isAdmin: boolean;
  raffles: Option[];
  transactions: Option[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "link" | "description">("view");
  const [pending, startTransition] = useTransition();
  const [downloading, setDownloading] = useState(false);

  const [linkType, setLinkType] = useState<"" | "raffle" | "financial_transaction">(
    entityType === "raffle" || entityType === "financial_transaction" ? entityType : "",
  );
  const [linkId, setLinkId] = useState(entityId ?? "");
  const [editDescription, setEditDescription] = useState(description ?? "");

  async function handleDownload() {
    setDownloading(true);
    const result = await getDownloadUrl(id);
    setDownloading(false);
    if (result.error || !result.url) {
      toast.error(result.error ?? "Não foi possível gerar o link.");
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  function handleSaveLink() {
    startTransition(async () => {
      try {
        await linkAttachment(
          id,
          linkType || "document",
          linkType ? linkId || null : null,
        );
        toast.success("Documento vinculado.");
        setMode("view");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao vincular.");
      }
    });
  }

  function handleSaveDescription() {
    startTransition(async () => {
      try {
        await updateAttachmentDescription(id, editDescription);
        toast.success("Descrição atualizada.");
        setMode("view");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
      }
    });
  }

  const entityOptions = linkType === "raffle" ? raffles : linkType === "financial_transaction" ? transactions : [];

  if (mode === "link") {
    return (
      <tr className="border-border border-b border-dashed">
        <td colSpan={7} className="py-3">
          <div className="border-border bg-secondary/50 grid gap-2 rounded-lg border border-dashed p-3">
            <div className="grid grid-cols-2 gap-2">
              <select
                value={linkType}
                onChange={(e) => {
                  setLinkType(e.target.value as typeof linkType);
                  setLinkId("");
                }}
                className="border-input h-8 rounded-lg border bg-transparent px-2.5 text-sm outline-none"
              >
                <option value="">Nenhum (documento avulso)</option>
                <option value="raffle">Rifa</option>
                <option value="financial_transaction">Lançamento financeiro</option>
              </select>
              {linkType ? (
                <select
                  value={linkId}
                  onChange={(e) => setLinkId(e.target.value)}
                  className="border-input h-8 rounded-lg border bg-transparent px-2.5 text-sm outline-none"
                >
                  <option value="">Selecione…</option>
                  {entityOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={pending} onClick={handleSaveLink}>
                Salvar
              </Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => setMode("view")}>
                Cancelar
              </Button>
            </div>
          </div>
        </td>
      </tr>
    );
  }

  if (mode === "description") {
    return (
      <tr className="border-border border-b border-dashed">
        <td colSpan={7} className="py-3">
          <div className="border-border bg-secondary/50 grid gap-2 rounded-lg border border-dashed p-3">
            <Input
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Descrição"
            />
            <div className="flex gap-2">
              <Button size="sm" disabled={pending} onClick={handleSaveDescription}>
                Salvar
              </Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => setMode("view")}>
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
      <td className="py-2.5 pr-4">
        <div className="font-medium">{fileName}</div>
        <div className="text-muted-foreground text-xs">
          {(fileSize / 1024).toFixed(0)} KB
          {description ? ` · ${description}` : ""}
        </div>
      </td>
      <td className="py-2.5 pr-4">
        <Badge variant="outline">{ATTACHMENT_KIND_LABELS[kind as keyof typeof ATTACHMENT_KIND_LABELS] ?? kind}</Badge>
      </td>
      <td className="py-2.5 pr-4">{entityLabel ?? "—"}</td>
      <td className="py-2.5 pr-4">
        <Badge variant={status === "UPLOADED" ? "confirmed" : status === "FAILED" ? "void" : "pending"} stamp>
          {ATTACHMENT_STATUS_LABELS[status] ?? status}
        </Badge>
      </td>
      <td className="py-2.5 pr-4">{uploadedByName ?? "—"}</td>
      <td className="font-figures py-2.5 pr-4">{new Date(uploadedAt).toLocaleString("pt-BR")}</td>
      <td className="py-2.5 pr-4">
        <div className="flex flex-wrap gap-1">
          <Button variant="outline" size="sm" disabled={downloading} onClick={handleDownload}>
            {downloading ? "Gerando…" : "Baixar"}
          </Button>
          {isAdmin ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setMode("link")}>
                Vincular
              </Button>
              <Button variant="outline" size="sm" onClick={() => setMode("description")}>
                Descrição
              </Button>
            </>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
