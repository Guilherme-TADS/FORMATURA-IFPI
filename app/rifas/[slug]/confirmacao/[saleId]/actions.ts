"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import type { SaleReceipt } from "@/lib/schemas/checkout";

export async function fetchSaleReceipt(
  saleId: string,
  slug: string,
): Promise<SaleReceipt | null> {
  if (!saleId || !slug) return null;

  try {
    const admin = createAdminClient();

    const { data: sale, error } = await admin
      .from("raffle_sales")
      .select(
        "id, amount_cents, status, created_at, buyers(full_name), payment_methods(name), raffles!inner(title, slug), raffle_sale_points(raffle_points(point_number))",
      )
      .eq("id", saleId)
      .eq("raffles.slug", slug)
      .maybeSingle();

    if (error || !sale) return null;

    const buyerName =
      (sale.buyers as { full_name?: string } | null)?.full_name ?? "Comprador";
    const raffleTitle =
      (sale.raffles as { title?: string } | null)?.title ?? "Rifa";
    const paymentMethod =
      (sale.payment_methods as { name?: string } | null)?.name ?? "Pix";

    const pointNumbers: number[] = [];
    const rspList = (sale.raffle_sale_points as Array<{
      raffle_points: { point_number: number } | null;
    }> | null) ?? [];

    for (const rsp of rspList) {
      if (rsp.raffle_points?.point_number != null) {
        pointNumbers.push(rsp.raffle_points.point_number);
      }
    }
    pointNumbers.sort((a, b) => a - b);

    return {
      saleId: sale.id,
      raffleTitle,
      buyerName,
      pointNumbers,
      amountCents: sale.amount_cents,
      paymentMethod,
      status: (sale.status as SaleReceipt["status"]) ?? "PENDING",
      createdAt: sale.created_at,
    };
  } catch {
    return null;
  }
}
