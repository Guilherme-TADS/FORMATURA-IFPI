import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { Badge } from "@/components/ui/badge";
import { centsToBRL } from "@/lib/money";
import { querySalesReport, parseSalesReportFilters } from "@/lib/reports/sales";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = { title: "Relatório de vendas" };

const PAGE_SIZE = 25;
const STATUS_LABELS: Record<string, string> = { CONFIRMED: "Confirmada", CANCELLED: "Cancelada" };

type SearchParams = {
  buyer?: string;
  seller?: string;
  numero?: string;
  pagamento?: string;
  status?: string;
  rifa?: string;
  de?: string;
  ate?: string;
  sort?: string;
  dir?: string;
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

export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const profile = await getCurrentProfile();
  if (profile?.role !== "ADMIN" && profile?.role !== "VISUALIZADOR") {
    redirect("/admin/dashboard");
  }

  const supabase = await createClient();
  const filters = parseSalesReportFilters(sp);
  const page = Math.max(1, Number(sp.page) || 1);

  const [{ rows, total }, { data: raffles }, { data: paymentMethods }, { data: sellers }] =
    await Promise.all([
      querySalesReport(supabase, filters, { page, pageSize: PAGE_SIZE }),
      supabase.from("raffles").select("id, title").order("created_at", { ascending: false }),
      supabase.from("payment_methods").select("id, name").order("name"),
      supabase
        .from("profiles")
        .select("id, full_name")
        .in("role", ["ADMIN", "VENDEDOR"])
        .order("full_name"),
    ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageTotalCents = rows.reduce((sum, r) => sum + r.amountCents, 0);
  const exportQuery = buildQuery(sp, { page: undefined });
  const exportPrefix = exportQuery ? `${exportQuery}&` : "";

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Relatório de vendas</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        {total} venda{total === 1 ? "" : "s"} encontrada{total === 1 ? "" : "s"} · Total nesta
        página: {centsToBRL(pageTotalCents)}
      </p>

      <form className="mb-4 grid gap-2 sm:grid-cols-4">
        <Input name="buyer" defaultValue={sp.buyer} placeholder="Comprador (nome ou telefone)" />
        <Input name="numero" defaultValue={sp.numero} placeholder="Número" type="number" min={1} />
        <select
          name="rifa"
          defaultValue={sp.rifa ?? ""}
          className="border-input h-9 rounded-lg border bg-transparent px-2.5 text-sm outline-none"
        >
          <option value="">Todas as rifas</option>
          {(raffles ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
        <select
          name="seller"
          defaultValue={sp.seller ?? ""}
          className="border-input h-9 rounded-lg border bg-transparent px-2.5 text-sm outline-none"
        >
          <option value="">Todos os vendedores</option>
          {(sellers ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </select>
        <select
          name="pagamento"
          defaultValue={sp.pagamento ?? ""}
          className="border-input h-9 rounded-lg border bg-transparent px-2.5 text-sm outline-none"
        >
          <option value="">Todas as formas</option>
          {(paymentMethods ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={sp.status ?? ""}
          className="border-input h-9 rounded-lg border bg-transparent px-2.5 text-sm outline-none"
        >
          <option value="">Todos os status</option>
          <option value="CONFIRMED">Confirmada</option>
          <option value="CANCELLED">Cancelada</option>
        </select>
        <Input name="de" defaultValue={sp.de} type="date" />
        <Input name="ate" defaultValue={sp.ate} type="date" />
        <div className="flex gap-2">
          <Button type="submit">Filtrar</Button>
          <LinkButton variant="outline" href="/admin/relatorios/vendas">
            Limpar
          </LinkButton>
        </div>
      </form>

      <div className="mb-6 flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<a href={`/api/reports/vendas?${exportPrefix}format=csv`} />}
        >
          Baixar CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<a href={`/api/reports/vendas?${exportPrefix}format=xlsx`} />}
        >
          Baixar XLSX
        </Button>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<a href={`/api/reports/vendas?${exportPrefix}format=pdf`} />}
        >
          Baixar PDF
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhuma venda encontrada com esses filtros.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-border border-b border-dashed text-left">
                <th className="label-tag py-2 pr-4">Comprador</th>
                <th className="label-tag py-2 pr-4">Números</th>
                <th className="label-tag py-2 pr-4">
                  <Link
                    className="hover:text-foreground"
                    href={`?${buildQuery(sp, { sort: "amount_cents", dir: sp.sort === "amount_cents" && sp.dir === "asc" ? "desc" : "asc", page: undefined })}`}
                  >
                    Valor
                  </Link>
                </th>
                <th className="label-tag py-2 pr-4">Pagamento</th>
                <th className="label-tag py-2 pr-4">Vendedor</th>
                <th className="label-tag py-2 pr-4">Rifa</th>
                <th className="label-tag py-2 pr-4">Status</th>
                <th className="label-tag py-2 pr-4">
                  <Link
                    className="hover:text-foreground"
                    href={`?${buildQuery(sp, { sort: "created_at", dir: sp.sort !== "amount_cents" && sp.dir === "asc" ? "desc" : "asc", page: undefined })}`}
                  >
                    Data
                  </Link>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-border border-b border-dashed last:border-0">
                  <td className="py-2.5 pr-4">
                    <div>{row.buyerName}</div>
                    <div className="text-muted-foreground font-figures text-xs">
                      {row.buyerPhone}
                    </div>
                  </td>
                  <td className="font-figures py-2.5 pr-4">{row.pointNumbers.join(", ")}</td>
                  <td className="font-figures py-2.5 pr-4">{centsToBRL(row.amountCents)}</td>
                  <td className="py-2.5 pr-4">{row.paymentMethod}</td>
                  <td className="py-2.5 pr-4">{row.sellerName}</td>
                  <td className="py-2.5 pr-4">{row.raffleTitle}</td>
                  <td className="py-2.5 pr-4">
                    <Badge variant={row.status === "CONFIRMED" ? "confirmed" : "void"} stamp>
                      {STATUS_LABELS[row.status] ?? row.status}
                    </Badge>
                  </td>
                  <td className="font-figures py-2.5 pr-4">
                    {new Date(row.createdAt).toLocaleString("pt-BR")}
                  </td>
                </tr>
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
            <LinkButton
              variant="outline"
              size="sm"
              href={`?${buildQuery(sp, { page: String(page - 1) })}`}
            >
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
            <LinkButton
              variant="outline"
              size="sm"
              href={`?${buildQuery(sp, { page: String(page + 1) })}`}
            >
              Próxima
            </LinkButton>
          )}
        </div>
      ) : null}
    </div>
  );
}
