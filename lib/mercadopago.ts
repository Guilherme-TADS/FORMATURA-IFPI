export type CreatePixPaymentInput = {
  accessToken: string;
  amountCents: number;
  description: string;
  payer: {
    fullName: string;
    phone?: string;
    email?: string;
  };
  externalReference: string;
  notificationUrl?: string;
};

export type MercadoPagoPixResponse = {
  id: number;
  status: "pending" | "approved" | "authorized" | "in_process" | "in_mediation" | "rejected" | "cancelled" | "refunded" | "charged_back";
  statusDetail: string;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl?: string;
  dateOfExpiration?: string;
};

export async function createMercadoPagoPixPayment({
  accessToken,
  amountCents,
  description,
  payer,
  externalReference,
  notificationUrl,
}: CreatePixPaymentInput): Promise<MercadoPagoPixResponse> {
  const cleanToken = accessToken.trim();
  if (!cleanToken) {
    throw new Error("Token de acesso do Mercado Pago não configurado.");
  }

  const amountInReais = Number((amountCents / 100).toFixed(2));
  if (amountInReais <= 0) {
    throw new Error("Valor do pagamento inválido.");
  }

  const nameParts = payer.fullName.trim().split(" ");
  const firstName = nameParts[0] || "Comprador";
  const lastName = nameParts.slice(1).join(" ") || "IFPI";
  const email = payer.email?.trim() || `comprador_${Date.now()}@formatura.com`;

  const bodyPayload: Record<string, unknown> = {
    transaction_amount: amountInReais,
    description: description.slice(0, 100),
    payment_method_id: "pix",
    payer: {
      email,
      first_name: firstName,
      last_name: lastName,
    },
    external_reference: externalReference,
  };

  if (notificationUrl) {
    bodyPayload.notification_url = notificationUrl;
  }

  const response = await fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${cleanToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": `pix_${externalReference}`,
    },
    body: JSON.stringify(bodyPayload),
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMsg = data?.message || data?.cause?.[0]?.description || "Erro ao gerar cobrança Pix no Mercado Pago.";
    throw new Error(errorMsg);
  }

  const txData = data?.point_of_interaction?.transaction_data;

  return {
    id: data.id,
    status: data.status,
    statusDetail: data.status_detail,
    qrCode: txData?.qr_code || "",
    qrCodeBase64: txData?.qr_code_base64 || "",
    ticketUrl: txData?.ticket_url,
    dateOfExpiration: data.date_of_expiration,
  };
}

export async function getMercadoPagoPayment(
  paymentId: string | number,
  accessToken: string,
): Promise<{ id: number; status: string; statusDetail: string; externalReference?: string; amountCents: number }> {
  const cleanToken = accessToken.trim();
  if (!cleanToken) {
    throw new Error("Token de acesso do Mercado Pago não configurado.");
  }

  const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${cleanToken}`,
      "Content-Type": "application/json",
    },
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMsg = data?.message || "Erro ao consultar pagamento no Mercado Pago.";
    throw new Error(errorMsg);
  }

  return {
    id: data.id,
    status: data.status,
    statusDetail: data.status_detail,
    externalReference: data.external_reference,
    amountCents: Math.round(Number(data.transaction_amount || 0) * 100),
  };
}
