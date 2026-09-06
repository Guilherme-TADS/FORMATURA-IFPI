import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = { title: "Compradores" };

export default async function BuyersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();

  let buyerIds: string[] | null = null;

  if (q && /^\d+$/.test(q.trim())) {
    const { data: points } = await supabase
      .from("raffle_points")
      .select("id")
      .eq("point_number", Number(q.trim()));
    const pointIds = (points ?? []).map((p) => p.id);
    if (pointIds.length > 0) {
      const { data: salePoints } = await supabase
        .from("raffle_sale_points")
        .select("sale_id")
        .in("point_id", pointIds);
      const saleIds = (salePoints ?? []).map((sp) => sp.sale_id);
      const { data: sales } = await supabase
        .from("raffle_sales")
        .select("buyer_id")
        .in("id", saleIds.length ? saleIds : ["00000000-0000-0000-0000-000000000000"]);
      buyerIds = (sales ?? []).map((s) => s.buyer_id);
    } else {
      buyerIds = [];
    }
  }

  let query = supabase
    .from("buyers")
    .select("id, full_name, phone, whatsapp, instagram, notes, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (buyerIds) {
    query = query.in(
      "id",
      buyerIds.length ? buyerIds : ["00000000-0000-0000-0000-000000000000"],
    );
  } else if (q) {
    query = query.or(
      `full_name.ilike.%${q}%,phone.ilike.%${q}%,whatsapp.ilike.%${q}%`,
    );
  }

  const { data: buyers } = await query;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        Compradores
      </h1>

      <form className="mb-6 flex max-w-md gap-2">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Nome, telefone, whatsapp ou número"
        />
        <Button type="submit">Buscar</Button>
      </form>

      {!buyers || buyers.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {q ? "Nenhum comprador encontrado." : "Nenhum comprador cadastrado ainda."}
        </p>
      ) : (
        <div className="border-border bg-card rounded-lg border">
          {buyers.map((buyer) => (
            <div
              key={buyer.id}
              className="border-border border-b border-dashed p-3 text-sm last:border-0"
            >
              <p className="font-medium">{buyer.full_name}</p>
              <p className="text-muted-foreground font-figures">
                {buyer.phone}
                {buyer.whatsapp ? ` · WhatsApp: ${buyer.whatsapp}` : ""}
                {buyer.instagram ? ` · ${buyer.instagram}` : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
