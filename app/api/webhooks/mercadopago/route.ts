import { NextResponse } from "next/server";
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

    const type = url.searchParams.get("type") || url.searchParams.get("topic") || body?.type || body?.action;

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

          // 2. Registra o pagamento em payment_records
          await admin.from("payment_records").insert({
            sale_id: saleId,
            payment_method_id: sale.payment_method_id,
            amount_cents: payment.amountCents || sale.amount_cents,
            reference_note: `Mercado Pago Pix ID: ${payment.id}`,
          });

          // 3. Atualiza o status da venda para CONFIRMED
          await admin
            .from("raffle_sales")
            .update({ status: "CONFIRMED" })
            .eq("id", saleId);
        }
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
