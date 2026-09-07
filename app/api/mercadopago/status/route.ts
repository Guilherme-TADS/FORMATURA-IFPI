import { NextResponse } from "next/server";
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

              await admin.from("payment_records").insert({
                sale_id: saleId,
                payment_method_id: sale.payment_method_id,
                amount_cents: payment.amountCents || sale.amount_cents,
                reference_note: `Mercado Pago Pix ID: ${payment.id}`,
              });

              await admin
                .from("raffle_sales")
                .update({ status: "CONFIRMED" })
                .eq("id", saleId);
            }

            return NextResponse.json({ status: "CONFIRMED" });
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
