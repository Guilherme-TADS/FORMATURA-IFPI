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

    const admin = createAdminClient();

    // Busca o método de pagamento PIX
    const { data: pixMethod } = await admin
      .from("payment_methods")
      .select("id")
      .eq("name", "PIX")
      .single();

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

    // Cria cobrança no Mercado Pago
    const mpPayment = await createMercadoPagoPixPayment({
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
