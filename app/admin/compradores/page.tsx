import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BuyerCard, type BuyerData } from "./buyer-card";

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
  const profile = await getCurrentProfile();

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
    .select(`
      id,
      full_name,
      phone,
      whatsapp,
      instagram,
      notes,
      created_at,
      raffle_sales (
        id,
        amount_cents,
        status,
        created_at,
        raffles (
          title
        ),
        raffle_sale_points (
          raffle_points (
            point_number
          )
        )
      )
    `)
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

  const formattedBuyers: BuyerData[] = (buyers ?? []).map((b) => {
    const sales = (b.raffle_sales ?? []) as unknown as Array<{
      id: string;
      amount_cents: number;
      status: string;
      created_at: string;
      raffles: { title: string } | null;
      raffle_sale_points: Array<{
        raffle_points: { point_number: number } | null;
      }>;
    }>;

    return {
      id: b.id,
      fullName: b.full_name,
      phone: b.phone,
      whatsapp: b.whatsapp,
      instagram: b.instagram,
      notes: b.notes,
      createdAt: b.created_at,
      sales: sales.map((s) => ({
        id: s.id,
        amount_cents: s.amount_cents,
        status: s.status,
        created_at: s.created_at,
        raffle_title: s.raffles?.title,
        points: (s.raffle_sale_points ?? [])
          .map((sp) => sp.raffle_points?.point_number)
          .filter((n): n is number => typeof n === "number")
          .sort((x, y) => x - y),
      })),
    };
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Compradores</h1>
          <p className="text-muted-foreground text-sm">
            Gerencie contatos, visualize histórico de compras e edite informações.
          </p>
        </div>
      </div>

      <form className="mb-6 flex max-w-md gap-2">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Nome, telefone, whatsapp ou número do ponto"
        />
        <Button type="submit">Buscar</Button>
      </form>

      {formattedBuyers.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {q ? "Nenhum comprador encontrado para esta busca." : "Nenhum comprador cadastrado ainda."}
        </p>
      ) : (
        <div className="grid gap-3">
          {formattedBuyers.map((buyer) => (
            <BuyerCard
              key={buyer.id}
              buyer={buyer}
              isAdmin={profile?.role === "ADMIN"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
