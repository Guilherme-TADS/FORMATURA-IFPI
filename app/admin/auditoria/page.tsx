import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { AUDIT_ACTION_LABELS, AUDIT_ENTITY_TYPE_LABELS } from "@/lib/audit";
import { AuditRow } from "./audit-row";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = { title: "Auditoria" };

const PAGE_SIZE = 30;

type SearchParams = {
  action?: string;
  entityType?: string;
  user?: string;
  de?: string;
  ate?: string;
  page?: string;
};

function buildQuery(sp: SearchParams, overrides: Partial<SearchParams>) {
  const merged = { ...sp, ...overrides };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value) params.set(key, String(value));
  }
  return params.toString();
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const profile = await getCurrentProfile();
  if (profile?.role !== "ADMIN") {
    redirect("/admin/dashboard");
  }

  const supabase = await createClient();
  const page = Math.max(1, Number(sp.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, old_data, new_data, metadata, created_at, profiles(full_name)", {
      count: "exact",
    })
    .order("created_at", { ascending: false });

  if (sp.action) query = query.eq("action", sp.action);
  if (sp.entityType) query = query.eq("entity_type", sp.entityType);
  if (sp.user) query = query.eq("user_id", sp.user);
  if (sp.de) query = query.gte("created_at", `${sp.de}T00:00:00`);
  if (sp.ate) query = query.lte("created_at", `${sp.ate}T23:59:59`);
  query = query.range(from, to);

  const [{ data: logs, count }, { data: staff }] = await Promise.all([
    query,
    supabase.from("profiles").select("id, full_name").order("full_name"),
  ]);

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Auditoria</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        {total} evento{total === 1 ? "" : "s"} registrado{total === 1 ? "" : "s"}.
      </p>

      <form className="mb-6 grid gap-2 sm:grid-cols-5">
        <select
          name="action"
          defaultValue={sp.action ?? ""}
          className="border-input h-9 rounded-lg border bg-transparent px-2.5 text-sm outline-none"
        >
          <option value="">Todas as ações</option>
          {Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="entityType"
          defaultValue={sp.entityType ?? ""}
          className="border-input h-9 rounded-lg border bg-transparent px-2.5 text-sm outline-none"
        >
          <option value="">Todos os tipos</option>
          {Object.entries(AUDIT_ENTITY_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="user"
          defaultValue={sp.user ?? ""}
          className="border-input h-9 rounded-lg border bg-transparent px-2.5 text-sm outline-none"
        >
          <option value="">Todos os usuários</option>
          {(staff ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </select>
        <Input name="de" defaultValue={sp.de} type="date" />
        <div className="flex gap-2">
          <Input name="ate" defaultValue={sp.ate} type="date" />
          <Button type="submit">Filtrar</Button>
        </div>
      </form>

      {!logs || logs.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhum evento encontrado com esses filtros.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-border border-b border-dashed text-left">
                <th className="label-tag py-2 pr-4">Ação</th>
                <th className="label-tag py-2 pr-4">Entidade</th>
                <th className="label-tag py-2 pr-4">Usuário</th>
                <th className="label-tag py-2 pr-4">Data</th>
                <th className="label-tag py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <AuditRow
                  key={log.id}
                  action={log.action}
                  entityType={log.entity_type}
                  entityId={log.entity_id}
                  userName={log.profiles?.full_name ?? null}
                  createdAt={log.created_at}
                  oldData={log.old_data}
                  newData={log.new_data}
                  metadata={log.metadata}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center gap-2 text-sm">
          {page <= 1 ? (
            <Button variant="outline" size="sm" disabled>
              Anterior
            </Button>
          ) : (
            <LinkButton variant="outline" size="sm" href={`?${buildQuery(sp, { page: String(page - 1) })}`}>
              Anterior
            </LinkButton>
          )}
          <span className="text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          {page >= totalPages ? (
            <Button variant="outline" size="sm" disabled>
              Próxima
            </Button>
          ) : (
            <LinkButton variant="outline" size="sm" href={`?${buildQuery(sp, { page: String(page + 1) })}`}>
              Próxima
            </LinkButton>
          )}
        </div>
      ) : null}
    </div>
  );
}
