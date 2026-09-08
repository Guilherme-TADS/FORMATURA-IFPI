import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMercadoPagoConfig } from "@/lib/settings";
import { createMercadoPagoPixPayment } from "@/lib/mercadopago";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      raffleId,
      reservationToken,
      fullName,
      phone,
      whatsapp,
      instagram,
      email,
    } = body;

    if (!raffleId || !reservationToken || !fullName || !phone) {
      return NextResponse.json(
        { error: "Dados obrigatórios não informados." },
        { status: 400 },
      );
    }

    const mpConfig = await getMercadoPagoConfig();
    if (!mpConfig.enabled || !mpConfig.accessToken) {
      return NextResponse.json(
        { error: "O PIX Automático não está habilitado no momento." },
        { status: 400 },
      );
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const admin = createAdminClient();

    // 1. Rate limiting por IP
    try {
      const { error: rateLimitError } = await admin.rpc("check_rate_limit", {
        p_bucket: "mercadopago_create_pix",
        p_identifier: ip,
        p_max_events: 10,
        p_window_seconds: 60,
      });
      if (rateLimitError) {
        return NextResponse.json(
          { error: "Muitas tentativas em pouco tempo. Aguarde um instante e tente novamente." },
          { status: 429 },
        );
      }
    } catch {
      // Ignora erro se rate limiting não estiver disponível no ambiente
    }

    // Busca o método de pagamento PIX (case-insensitive)
    const { data: pixMethod } = await admin
      .from("payment_methods")
      .select("id")
      .ilike("name", "pix")
      .maybeSingle();

    if (!pixMethod) {
      return NextResponse.json(
        { error: "Método de pagamento PIX não encontrado." },
        { status: 500 },
      );
    }

    // Chama rpc_confirm_sale para criar a venda em estado PENDING
    const idempotencyKey = reservationToken;
    const { data: receipt, error: rpcError } = await admin.rpc(
      "rpc_confirm_sale",
      {
        p_raffle_id: raffleId,
        p_reservation_token: reservationToken,
        p_buyer_full_name: fullName.trim(),
        p_buyer_phone: phone.trim(),
        p_buyer_whatsapp: whatsapp?.trim() || null,
        p_buyer_instagram: instagram?.trim() || null,
        p_buyer_notes: "PIX Automático Mercado Pago",
        p_payment_method_id: pixMethod.id,
        p_idempotency_key: idempotencyKey,
      },
    );

    if (rpcError || !receipt) {
      return NextResponse.json(
        { error: rpcError?.message || "Não foi possível registrar a reserva." },
        { status: 400 },
      );
    }

    const receiptObj = receipt as {
      saleId: string;
      raffleTitle: string;
      amountCents: number;
      pointNumbers: number[];
      status: string;
    };

    // Obter URL da aplicação para notification_url do Webhook
    const host = req.headers.get("host") || "localhost:3000";
    const proto = req.headers.get("x-forwarded-proto") || "http";
    const appUrl = `${proto}://${host}`;
    const notificationUrl = `${appUrl}/api/webhooks/mercadopago`;

    // Cria cobrança no Mercado Pago com rollback automático caso a API externa falhe
    let mpPayment;
    try {
      mpPayment = await createMercadoPagoPixPayment({
        accessToken: mpConfig.accessToken,
        amountCents: receiptObj.amountCents,
        description: `Formatura IFPI - Rifa ${receiptObj.raffleTitle} (${receiptObj.pointNumbers.join(", ")})`,
        payer: {
          fullName: fullName.trim(),
          phone: phone.trim(),
          email: email?.trim(),
        },
        externalReference: receiptObj.saleId,
        notificationUrl,
      });
    } catch (mpErr) {
      // Desfaz a venda e devolve os pontos caso o gateway rejeite a cobrança
      try {
        await admin
          .from("raffle_sales")
          .update({
            status: "CANCELLED",
            cancelled_reason: "Falha na criação do PIX no Mercado Pago",
            cancelled_at: new Date().toISOString(),
          })
          .eq("id", receiptObj.saleId);

        const { data: points } = await admin
          .from("raffle_sale_points")
          .select("point_id")
          .eq("sale_id", receiptObj.saleId);

        if (points && points.length > 0) {
          await admin
            .from("raffle_points")
            .update({
              status: "AVAILABLE",
              reserved_until: null,
              reservation_token: null,
            })
            .in(
              "id",
              points.map((p) => p.point_id),
            );
        }
      } catch (rollbackErr) {
        console.warn("Falha ao desfazer reserva após erro no Mercado Pago:", rollbackErr);
      }

      throw mpErr;
    }

    // Registra o ID do Mercado Pago em audit_logs para rastreabilidade
    await admin.from("audit_logs").insert({
      entity_type: "raffle_sale",
      entity_id: receiptObj.saleId,
      action: "PAYMENT_INTENT_CREATED",
      user_id: null,
      new_data: {
        gateway: "mercadopago",
        mp_payment_id: mpPayment.id,
        status: mpPayment.status,
      },
    });

    return NextResponse.json({
      saleId: receiptObj.saleId,
      qrCode: mpPayment.qrCode,
      qrCodeBase64: mpPayment.qrCodeBase64,
      paymentId: mpPayment.id,
      dateOfExpiration: mpPayment.dateOfExpiration,
      receipt: receiptObj,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro ao gerar PIX Automático.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
