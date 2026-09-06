import "server-only";
import type { createClient } from "@/lib/supabase/server";

export type SalesReportFilters = {
  buyerQuery?: string;
  sellerId?: string;
  pointNumber?: number;
  paymentMethodId?: string;
  status?: "CONFIRMED" | "CANCELLED";
  raffleId?: string;
  startDate?: string;
  endDate?: string;
  sort?: "created_at" | "amount_cents";
  dir?: "asc" | "desc";
};

export type SalesReportRow = {
  id: string;
  amountCents: number;
  status: string;
  createdAt: string;
  cancelledReason: string | null;
  raffleTitle: string;
  buyerName: string;
  buyerPhone: string;
  paymentMethod: string;
  sellerName: string;
  pointNumbers: number[];
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const NO_MATCH_SALE_ID = "00000000-0000-0000-0000-000000000000";

// Filtering by buyer name/phone requires narrowing on a *related* table,
// which PostgREST only applies to the top-level rows when the embed uses
// the !inner hint — but buyers is a to-one relation, so embedding it as
// !inner doesn't affect what's displayed (there's only one buyer per sale
// either way). The number filter is deliberately NOT done the same way:
// raffle_sale_points is to-many, and a !inner embed + filter on it would
// have PostgREST return only the *matching* embedded rows, silently
// truncating the "Números" column to just the searched-for number instead
// of showing every number in that sale. So it's resolved as a separate
// lookup of matching sale ids instead, applied as a plain .in() filter.
export async function querySalesReport(
  supabase: SupabaseServerClient,
  filters: SalesReportFilters,
  pagination: { page: number; pageSize: number },
): Promise<{ rows: SalesReportRow[]; total: number }> {
  const buyersEmbed = filters.buyerQuery ? "buyers!inner" : "buyers";

  let query = supabase
    .from("raffle_sales")
    .select(
      `id, amount_cents, status, created_at, cancelled_reason, raffle_id,
       raffles(title),
       ${buyersEmbed}(full_name, phone),
       payment_methods(name),
       profiles!raffle_sales_seller_id_fkey(full_name),
       raffle_sale_points(raffle_points(point_number))`,
      { count: "exact" },
    );

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.raffleId) query = query.eq("raffle_id", filters.raffleId);
  if (filters.sellerId) query = query.eq("seller_id", filters.sellerId);
  if (filters.paymentMethodId) query = query.eq("payment_method_id", filters.paymentMethodId);
  if (filters.startDate) query = query.gte("created_at", `${filters.startDate}T00:00:00`);
  if (filters.endDate) query = query.lte("created_at", `${filters.endDate}T23:59:59`);
  if (filters.buyerQuery) {
    query = query.or(`full_name.ilike.%${filters.buyerQuery}%,phone.ilike.%${filters.buyerQuery}%`, {
      foreignTable: "buyers",
    });
  }
  if (filters.pointNumber) {
    const { data: matches } = await supabase
      .from("raffle_points")
      .select("raffle_sale_points(sale_id)")
      .eq("point_number", filters.pointNumber);
    const saleIds = (matches ?? []).flatMap((m) => m.raffle_sale_points.map((sp) => sp.sale_id));
    query = query.in("id", saleIds.length > 0 ? saleIds : [NO_MATCH_SALE_ID]);
  }

  query = query.order(filters.sort ?? "created_at", { ascending: filters.dir === "asc" });

  const from = (pagination.page - 1) * pagination.pageSize;
  const to = from + pagination.pageSize - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);

  const rows: SalesReportRow[] = (data ?? []).map((s) => ({
    id: s.id,
    amountCents: s.amount_cents,
    status: s.status,
    createdAt: s.created_at,
    cancelledReason: s.cancelled_reason,
    raffleTitle: s.raffles?.title ?? "—",
    buyerName: s.buyers?.full_name ?? "—",
    buyerPhone: s.buyers?.phone ?? "—",
    paymentMethod: s.payment_methods?.name ?? "—",
    sellerName: s.profiles?.full_name ?? "Autoatendimento",
    pointNumbers: (s.raffle_sale_points ?? [])
      .map((sp) => sp.raffle_points?.point_number)
      .filter((n): n is number => n !== undefined && n !== null)
      .sort((a, b) => a - b),
  }));

  return { rows, total: count ?? 0 };
}

export function parseSalesReportFilters(searchParams: {
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
}): SalesReportFilters {
  return {
    buyerQuery: searchParams.buyer?.trim() || undefined,
    sellerId: searchParams.seller || undefined,
    pointNumber: searchParams.numero ? Number(searchParams.numero) : undefined,
    paymentMethodId: searchParams.pagamento || undefined,
    status: searchParams.status === "CONFIRMED" || searchParams.status === "CANCELLED"
      ? searchParams.status
      : undefined,
    raffleId: searchParams.rifa || undefined,
    startDate: searchParams.de || undefined,
    endDate: searchParams.ate || undefined,
    sort: searchParams.sort === "amount_cents" ? "amount_cents" : "created_at",
    dir: searchParams.dir === "asc" ? "asc" : "desc",
  };
}
