"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export type BuyerTicketSale = {
  saleId: string;
  raffleTitle: string;
  raffleSlug: string;
  raffleStatus: string;
  pointNumbers: number[];
  amountCents: number;
  paymentMethod: string;
  status: "CONFIRMED" | "PENDING" | "CANCELLED";
  createdAt: string;
};

export type LookupResult = {
  found: boolean;
  message?: string;
  buyerName?: string;
  sales?: BuyerTicketSale[];
};

export async function searchBuyerTickets(
  phoneInput: string,
): Promise<LookupResult> {
  const digits = phoneInput.replace(/\D/g, "");

  if (digits.length < 8) {
    return {
      found: false,
      message: "Por favor, digite um telefone válido com DDD (mínimo de 8 dígitos).",
    };
  }

  try {
    const admin = createAdminClient();
    const last8 = digits.slice(-8);

    // Busca compradores que coincidam com o final do telefone
    const { data: allBuyers, error: buyersErr } = await admin
      .from("buyers")
      .select("id, full_name, phone");

    if (buyersErr || !allBuyers) {
      return {
        found: false,
        message: "Erro ao consultar o banco de dados. Tente novamente.",
      };
    }

    const matchedBuyers = allBuyers.filter((b) => {
      const clean = (b.phone ?? "").replace(/\D/g, "");
      return clean.endsWith(last8) || clean.includes(last8);
    });

    if (matchedBuyers.length === 0) {
      return {
        found: false,
        message:
          "Nenhum bilhete encontrado para este telefone. Certifique-se de incluir o DDD correto.",
      };
    }

    const matchedBuyerIds = matchedBuyers.map((b) => b.id);

    // Busca vendas desses compradores
    const { data: sales, error: salesErr } = await admin
      .from("raffle_sales")
      .select(`
        id,
        amount_cents,
        status,
        created_at,
        payment_methods ( name ),
        raffles ( id, title, slug, status ),
        raffle_sale_points (
          raffle_points ( point_number )
        ),
        profiles!raffle_sales_seller_id_fkey ( full_name )
      `)
      .in("buyer_id", matchedBuyerIds)
      .order("created_at", { ascending: false });

    if (salesErr || !sales || sales.length === 0) {
      return {
        found: false,
        message:
          "Nenhuma compra registrada para os dados deste comprador no momento.",
      };
    }

    // Identifica vendas já aprovadas no audit_log
    const saleIds = sales.map((s) => s.id);
    const { data: approvedLogs } = await admin
      .from("audit_logs")
      .select("entity_id")
      .eq("entity_type", "raffle_sale")
      .eq("action", "SALE_APPROVED")
      .in("entity_id", saleIds);

    const approvedSaleIds = new Set(approvedLogs?.map((l) => l.entity_id));

    const resultSales: BuyerTicketSale[] = sales.map((sale) => {
      let effectiveStatus: "CONFIRMED" | "PENDING" | "CANCELLED" = "CONFIRMED";
      if (sale.status === "CANCELLED") {
        effectiveStatus = "CANCELLED";
      } else if (!sale.profiles && !approvedSaleIds.has(sale.id)) {
        effectiveStatus = "PENDING";
      } else {
        effectiveStatus = "CONFIRMED";
      }

      const rawPoints = (sale.raffle_sale_points as Array<{
        raffle_points: { point_number: number } | null;
      }> | null) ?? [];

      const pointNumbers: number[] = [];
      for (const rsp of rawPoints) {
        if (rsp.raffle_points?.point_number != null) {
          pointNumbers.push(rsp.raffle_points.point_number);
        }
      }
      pointNumbers.sort((a, b) => a - b);

      const raffleData = sale.raffles as { title?: string; slug?: string; status?: string } | null;
      const paymentData = sale.payment_methods as { name?: string } | null;

      return {
        saleId: sale.id,
        raffleTitle: raffleData?.title ?? "Rifa",
        raffleSlug: raffleData?.slug ?? "",
        raffleStatus: raffleData?.status ?? "OPEN",
        pointNumbers,
        amountCents: sale.amount_cents,
        paymentMethod: paymentData?.name ?? "Pix",
        status: effectiveStatus,
        createdAt: sale.created_at,
      };
    });

    return {
      found: true,
      buyerName: matchedBuyers[0]?.full_name,
      sales: resultSales,
    };
  } catch {
    return {
      found: false,
      message: "Ocorreu um erro ao consultar seus bilhetes. Tente novamente.",
    };
  }
}
