import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMercadoPagoConfig } from "@/lib/settings";
import { getMercadoPagoPayment } from "@/lib/mercadopago";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const saleId = url.searchParams.get("saleId");
    const paymentId = url.searchParams.get("paymentId");

    if (!saleId) {
      return NextResponse.json({ error: "saleId é obrigatório" }, { status: 400 });
    }

    const admin = createAdminClient();

    // 1. Verifica se a venda já está CONFIRMED no banco de dados
    const { data: sale } = await admin
      .from("raffle_sales")
      .select("id, status, payment_method_id, amount_cents")
      .eq("id", saleId)
      .maybeSingle();

    if (!sale) {
      return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });
    }

    if (sale.status === "CONFIRMED") {
      return NextResponse.json({ status: "CONFIRMED" });
    }

    if (sale.status === "CANCELLED") {
      return NextResponse.json({ status: "CANCELLED" });
    }

    // 2. Se a venda ainda está PENDING e temos paymentId, consulta o Mercado Pago (fallback se o webhook demorar)
    if (paymentId) {
      const mpConfig = await getMercadoPagoConfig();
      if (mpConfig.accessToken) {
        try {
          const payment = await getMercadoPagoPayment(paymentId, mpConfig.accessToken);
          if (payment.status === "approved") {
            // Aprova a venda imediatamente
            const { data: existingApproval } = await admin
              .from("audit_logs")
              .select("id")
              .eq("entity_type", "raffle_sale")
              .eq("entity_id", saleId)
              .eq("action", "SALE_APPROVED")
              .maybeSingle();

            if (!existingApproval) {
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
                  source: "status_polling",
                },
              });

              // Atualiza o registro em payment_records (ou cria se inexistente) para evitar duplicidade
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

              await admin
                .from("raffle_sales")
                .update({ status: "CONFIRMED" })
                .eq("id", saleId);

              try { revalidateTag("raffles", "max"); } catch {}
            }

            return NextResponse.json({ status: "CONFIRMED" });
          }

          if (payment.status === "cancelled" || payment.status === "rejected") {
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

            // 3. Registra auditoria
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
                source: "status_polling",
              },
            });

            try { revalidateTag("raffles", "max"); } catch {}

            return NextResponse.json({ status: "CANCELLED" });
          }
        } catch {
          // Ignora falha temporária de checagem externa e continua como PENDING
        }
      }
    }

    return NextResponse.json({ status: sale.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro ao verificar status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
