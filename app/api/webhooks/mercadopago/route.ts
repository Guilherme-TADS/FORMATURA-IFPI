import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMercadoPagoConfig } from "@/lib/settings";
import { getMercadoPagoPayment } from "@/lib/mercadopago";

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      // Body may be empty in some webhook test calls
    }

    // Mercado Pago pode enviar o ID via query (?data.id= ou ?id=) ou no JSON body ({ data: { id } })
    const paymentId =
      url.searchParams.get("data.id") ||
      url.searchParams.get("id") ||
      (body?.data as { id?: string | number } | undefined)?.id ||
      (body?.id as string | number | undefined);

    // Se não for evento de pagamento, responde 200 para dar ack
    if (!paymentId) {
      return NextResponse.json({ received: true });
    }

    const mpConfig = await getMercadoPagoConfig();
    if (!mpConfig.accessToken) {
      console.warn("Webhook Mercado Pago recebido, mas Access Token não configurado.");
      return NextResponse.json({ error: "Access token não configurado" }, { status: 400 });
    }

    // Consulta os detalhes verídicos do pagamento diretamente na API do Mercado Pago
    const payment = await getMercadoPagoPayment(paymentId, mpConfig.accessToken);

    if (payment.status === "approved" && payment.externalReference) {
      const saleId = payment.externalReference;
      const admin = createAdminClient();

      // Busca a venda correspondente
      const { data: sale } = await admin
        .from("raffle_sales")
        .select("id, status, payment_method_id, amount_cents")
        .eq("id", saleId)
        .maybeSingle();

      if (sale && sale.status !== "CANCELLED") {
        // Verifica se já foi aprovada anteriormente para evitar duplicidade
        const { data: existingApproval } = await admin
          .from("audit_logs")
          .select("id")
          .eq("entity_type", "raffle_sale")
          .eq("entity_id", saleId)
          .eq("action", "SALE_APPROVED")
          .maybeSingle();

        if (!existingApproval) {
          // 1. Registra auditoria de aprovação automática
          await admin.from("audit_logs").insert({
            entity_type: "raffle_sale",
            entity_id: saleId,
            action: "SALE_APPROVED",
            user_id: null,
            new_data: {
              gateway: "mercadopago",
              mp_payment_id: payment.id,
              status_detail: payment.statusDetail,
              amount_cents: payment.amountCents,
              auto_confirmed: true,
            },
          });

          // 2. Atualiza o registro em payment_records (ou cria se inexistente) para evitar duplicidade
          const { data: existingPayment } = await admin
            .from("payment_records")
            .select("id")
            .eq("sale_id", saleId)
            .maybeSingle();

          if (existingPayment) {
            await admin
              .from("payment_records")
              .update({
                amount_cents: payment.amountCents || sale.amount_cents,
                reference_note: `Mercado Pago Pix ID: ${payment.id}`,
              })
              .eq("id", existingPayment.id);
          } else {
            await admin.from("payment_records").insert({
              sale_id: saleId,
              payment_method_id: sale.payment_method_id,
              amount_cents: payment.amountCents || sale.amount_cents,
              reference_note: `Mercado Pago Pix ID: ${payment.id}`,
            });
          }

          // 3. Atualiza o status da venda para CONFIRMED e revalida cache
          await admin
            .from("raffle_sales")
            .update({ status: "CONFIRMED" })
            .eq("id", saleId);

          try { revalidateTag("raffles", "max"); } catch {}
        }
      }
    }

    if ((payment.status === "cancelled" || payment.status === "rejected") && payment.externalReference) {
      const saleId = payment.externalReference;
      const admin = createAdminClient();

      const { data: sale } = await admin
        .from("raffle_sales")
        .select("id, status")
        .eq("id", saleId)
        .maybeSingle();

      if (sale && (sale.status as string) === "PENDING") {
        const reason = `PIX Mercado Pago ${payment.status === "cancelled" ? "expirado/cancelado" : "rejeitado"}`;

        // 1. Atualiza venda para CANCELLED
        await admin
          .from("raffle_sales")
          .update({
            status: "CANCELLED",
            cancelled_reason: reason,
            cancelled_at: new Date().toISOString(),
          })
          .eq("id", saleId);

        // 2. Retorna números para AVAILABLE
        const { data: salePoints } = await admin
          .from("raffle_sale_points")
          .select("point_id")
          .eq("sale_id", saleId);

        if (salePoints && salePoints.length > 0) {
          const pointIds = salePoints.map((sp) => sp.point_id);
          await admin
            .from("raffle_points")
            .update({
              status: "AVAILABLE",
              reserved_until: null,
              reservation_token: null,
            })
            .in("id", pointIds);
        }

        // 3. Registra auditoria e revalida cache
        await admin.from("audit_logs").insert({
          entity_type: "raffle_sale",
          entity_id: saleId,
          action: "SALE_CANCELLED",
          user_id: null,
          new_data: {
            reason,
            gateway: "mercadopago",
            mp_payment_id: payment.id,
            auto_cancelled: true,
            source: "webhook",
          },
        });

        try { revalidateTag("raffles", "max"); } catch {}
      }
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("Erro no processamento do webhook do Mercado Pago:", err);
    // Retorna 200 para o Mercado Pago não tentar reenviar indefinidamente se for erro de payload
    return NextResponse.json({ status: "error", message: "Internal server error" }, { status: 200 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "Webhook do Mercado Pago ativo e operacional." });
}
