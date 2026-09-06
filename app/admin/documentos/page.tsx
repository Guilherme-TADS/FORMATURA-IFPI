import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ATTACHMENT_KIND_LABELS, ATTACHMENT_KINDS, ATTACHMENT_STATUS_LABELS } from "@/lib/uploads";
import type { Database } from "@/types/database";

type AttachmentStatus = Database["public"]["Enums"]["attachment_status"];
const ATTACHMENT_STATUSES = Object.keys(ATTACHMENT_STATUS_LABELS) as AttachmentStatus[];
import { DocumentUploadForm } from "./document-upload-form";
import { DocumentRow } from "./document-row";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = { title: "Documentos" };

const ENTITY_TYPE_LABELS: Record<string, string> = {
  document: "Avulso",
  raffle: "Rifa",
  financial_transaction: "Lançamento financeiro",
  raffle_sale: "Venda de rifa",
};

const EMPTY_UUID = "00000000-0000-0000-0000-000000000000";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; entityType?: string; status?: string; q?: string }>;
}) {
  const { kind, entityType, status, q } = await searchParams;

  const profile = await getCurrentProfile();
  if (profile?.role !== "ADMIN" && profile?.role !== "VISUALIZADOR") {
    redirect("/admin/dashboard");
  }
  const isAdmin = profile.role === "ADMIN";

  const supabase = await createClient();

  let query = supabase
    .from("attachments")
    .select(
      "id, entity_type, entity_id, kind, status, file_name, file_size, description, uploaded_at, profiles(full_name)",
    )
    .order("uploaded_at", { ascending: false })
    .limit(100);

  if (kind) query = query.eq("kind", kind);
  if (entityType) query = query.eq("entity_type", entityType);
  if (status && ATTACHMENT_STATUSES.includes(status as AttachmentStatus)) {
    query = query.eq("status", status as AttachmentStatus);
  }
  if (q) query = query.or(`file_name.ilike.%${q}%,description.ilike.%${q}%`);

  const [{ data: attachments }, { data: raffleOptions }, { data: transactionOptions }] =
    await Promise.all([
      query,
      supabase
        .from("raffles")
        .select("id, title")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("financial_transactions")
        .select("id, description")
        .is("deleted_at", null)
        .order("occurred_on", { ascending: false })
        .limit(50),
    ]);

  const raffles = (raffleOptions ?? []).map((r) => ({ id: r.id, label: r.title }));
  const transactions = (transactionOptions ?? []).map((t) => ({ id: t.id, label: t.description }));

  const raffleIds = [
    ...new Set((attachments ?? []).filter((a) => a.entity_type === "raffle" && a.entity_id).map((a) => a.entity_id as string)),
  ];
  const transactionIds = [
    ...new Set(
      (attachments ?? [])
        .filter((a) => a.entity_type === "financial_transaction" && a.entity_id)
        .map((a) => a.entity_id as string),
    ),
  ];
  const saleIds = [
    ...new Set(
      (attachments ?? []).filter((a) => a.entity_type === "raffle_sale" && a.entity_id).map((a) => a.entity_id as string),
    ),
  ];

  const [{ data: linkedRaffles }, { data: linkedTransactions }, { data: linkedSales }] =
    await Promise.all([
      supabase.from("raffles").select("id, title").in("id", raffleIds.length ? raffleIds : [EMPTY_UUID]),
      supabase
        .from("financial_transactions")
        .select("id, description")
        .in("id", transactionIds.length ? transactionIds : [EMPTY_UUID]),
      supabase
        .from("raffle_sales")
        .select("id, buyers(full_name)")
        .in("id", saleIds.length ? saleIds : [EMPTY_UUID]),
    ]);

  const entityLabels = new Map<string, string>();
  for (const r of linkedRaffles ?? []) entityLabels.set(`raffle:${r.id}`, r.title);
  for (const t of linkedTransactions ?? []) entityLabels.set(`financial_transaction:${t.id}`, t.description);
  for (const s of linkedSales ?? []) entityLabels.set(`raffle_sale:${s.id}`, s.buyers?.full_name ?? "Venda");

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Documentos</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        Comprovantes e documentos administrativos (notas fiscais, contratos, orçamentos, recibos).
      </p>

      {isAdmin ? (
        <div className="mb-8">
          <DocumentUploadForm raffles={raffles} transactions={transactions} />
        </div>
      ) : null}

      <form className="mb-6 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto]">
        <Input name="q" defaultValue={q} placeholder="Nome do arquivo ou descrição" />
        <select
          name="kind"
          defaultValue={kind ?? ""}
          className="border-input h-9 rounded-lg border bg-transparent px-2.5 text-sm outline-none"
        >
          <option value="">Todos os tipos</option>
          {ATTACHMENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {ATTACHMENT_KIND_LABELS[k]}
            </option>
          ))}
        </select>
        <select
          name="entityType"
          defaultValue={entityType ?? ""}
          className="border-input h-9 rounded-lg border bg-transparent px-2.5 text-sm outline-none"
        >
          <option value="">Todos os vínculos</option>
          {Object.entries(ENTITY_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={status ?? ""}
          className="border-input h-9 rounded-lg border bg-transparent px-2.5 text-sm outline-none"
        >
          <option value="">Todos os status</option>
          {Object.entries(ATTACHMENT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Button type="submit">Filtrar</Button>
      </form>

      {!attachments || attachments.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhum documento encontrado.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-border border-b border-dashed text-left">
                <th className="label-tag py-2 pr-4">Arquivo</th>
                <th className="label-tag py-2 pr-4">Tipo</th>
                <th className="label-tag py-2 pr-4">Vínculo</th>
                <th className="label-tag py-2 pr-4">Status</th>
                <th className="label-tag py-2 pr-4">Enviado por</th>
                <th className="label-tag py-2 pr-4">Data</th>
                <th className="label-tag py-2 pr-4">Ações</th>
              </tr>
            </thead>
            <tbody>
              {attachments.map((a) => (
                <DocumentRow
                  key={a.id}
                  id={a.id}
                  fileName={a.file_name}
                  fileSize={a.file_size}
                  kind={a.kind}
                  status={a.status}
                  description={a.description}
                  entityType={a.entity_type}
                  entityId={a.entity_id}
                  entityLabel={
                    a.entity_id ? (entityLabels.get(`${a.entity_type}:${a.entity_id}`) ?? null) : null
                  }
                  uploadedByName={a.profiles?.full_name ?? null}
                  uploadedAt={a.uploaded_at}
                  isAdmin={isAdmin}
                  raffles={raffles}
                  transactions={transactions}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
