"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizePhoneDigits,
  getPhoneSearchPattern,
  isPhoneMatch,
} from "@/lib/phone";

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
  const digits = normalizePhoneDigits(phoneInput);

  if (!digits) {
    return {
      found: false,
      message:
        "Por favor, digite um telefone válido com DDD (mínimo de 10 dígitos, ex: (86) 99999-9999).",
    };
  }

  try {
    const admin = createAdminClient();

    // 1. Rate limiting por IP do cliente para evitar enumeração de telefones
    try {
      const headerList = await headers();
      const ip =
        headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        headerList.get("x-real-ip")?.trim() ??
        "unknown";

      const { error: rateLimitError } = await admin.rpc("check_rate_limit", {
        p_bucket: "ticket_lookup",
        p_identifier: ip,
        p_max_events: 15,
        p_window_seconds: 60,
      });

      if (rateLimitError) {
        if (
          rateLimitError.code === "P0001" ||
          rateLimitError.message?.toLowerCase().includes("muitas tentativas")
        ) {
          return {
            found: false,
            message:
              "Muitas consultas realizadas em pouco tempo. Por favor, aguarde um minuto e tente novamente.",
          };
        }
      }
    } catch {
      // Falha graciosa se headers() ou rate limiting não estiverem disponíveis
    }

    // 2. Busca direcionada no Postgres usando padrão com DDD e sufixo
    const pattern = getPhoneSearchPattern(digits);

    const { data: candidateBuyers, error: buyersErr } = await admin
      .from("buyers")
      .select("id, full_name, phone, whatsapp")
      .or(
        `phone.ilike.%${pattern.ddd}%${pattern.part1}%${pattern.part2}%,whatsapp.ilike.%${pattern.ddd}%${pattern.part1}%${pattern.part2}%`
      )
      .limit(30);

    if (buyersErr) {
      return {
        found: false,
        message: "Erro ao consultar o banco de dados. Tente novamente.",
      };
    }

    // 3. Validação estrita para impedir vazamento cruzado entre DDDs
    const matchedBuyers = (candidateBuyers ?? []).filter(
      (b) => isPhoneMatch(b.phone, digits) || isPhoneMatch(b.whatsapp, digits)
    );

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
