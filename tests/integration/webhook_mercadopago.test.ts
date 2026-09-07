import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { anonClient, adminClient } from "../helpers/supabase";
import { POST as webhookHandler } from "@/app/api/webhooks/mercadopago/route";
import { GET as statusHandler } from "@/app/api/mercadopago/status/route";

describe("Mercado Pago Webhook & Auto Approval Integration", () => {
  const admin = adminClient();
  const raffleIds: string[] = [];

  beforeAll(() => {
    process.env.MERCADO_PAGO_ACCESS_TOKEN = "TEST_MP_ACCESS_TOKEN";
  });

  afterAll(async () => {
    delete process.env.MERCADO_PAGO_ACCESS_TOKEN;
    for (const raffleId of raffleIds) {
      const { data: sales } = await admin
        .from("raffle_sales")
        .select("id, buyer_id")
        .eq("raffle_id", raffleId);
      const saleIds = (sales ?? []).map((s) => s.id);
      const buyerIds = (sales ?? []).map((s) => s.buyer_id);
      if (saleIds.length > 0) {
        await admin.from("audit_logs").delete().in("entity_id", saleIds);
        await admin.from("payment_records").delete().in("sale_id", saleIds);
        await admin.from("raffle_sale_points").delete().in("sale_id", saleIds);
        await admin.from("raffle_sales").delete().in("id", saleIds);
      }
      if (buyerIds.length > 0) {
        await admin.from("buyers").delete().in("id", buyerIds);
      }
      await admin.from("raffles").delete().eq("id", raffleId);
    }
  });

  async function createTestRaffle(totalPoints: number) {
    const slug = `teste-mp-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const { data, error } = await admin
      .from("raffles")
      .insert({
        slug,
        title: "Rifa de teste (Mercado Pago)",
        total_points: totalPoints,
        unit_price_cents: 1500,
        starts_at: new Date(Date.now() - 3600_000).toISOString(),
        ends_at: new Date(Date.now() + 3600_000).toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;
    raffleIds.push(data.id);

    const points = Array.from({ length: totalPoints }, (_, i) => ({
      raffle_id: data.id,
      point_number: i + 1,
      status: "AVAILABLE" as const,
    }));
    await admin.from("raffle_points").insert(points);
    return data.id;
  }

  it("automatically confirms pending sale upon approved webhook notification", async () => {
    const raffleId = await createTestRaffle(10);
    const client = anonClient();
    const token = randomUUID();

    // 1. Reserva ponto #1
    await client.rpc("rpc_reserve_points", {
      p_raffle_id: raffleId,
      p_point_numbers: [1],
      p_reservation_token: token,
      p_ttl_minutes: 15,
    });

    const { data: method } = await admin
      .from("payment_methods")
      .select("id")
      .eq("name", "PIX")
      .single();

    // 2. Confirmação inicial como PENDING (autoatendimento público)
    const idempotencyKey = randomUUID();
    const { data: receipt } = await client.rpc("rpc_confirm_sale", {
      p_raffle_id: raffleId,
      p_reservation_token: token,
      p_buyer_full_name: "Comprador Mercado Pago",
      p_buyer_phone: "(86) 98888-7777",
      p_buyer_whatsapp: "",
      p_buyer_instagram: "",
      p_buyer_notes: "PIX Automático MP",
      p_payment_method_id: method!.id,
      p_idempotency_key: idempotencyKey,
    });

    const receiptObj = receipt as { saleId: string };
    const saleId = receiptObj.saleId;
    const { data: initialSale } = await admin
      .from("raffle_sales")
      .select("seller_id")
      .eq("id", saleId)
      .single();
    expect(initialSale?.seller_id).toBeNull();

    // Antes do webhook, não há aprovação na auditoria
    const { data: initialLogs } = await admin
      .from("audit_logs")
      .select("id")
      .eq("entity_id", saleId)
      .eq("action", "SALE_APPROVED");
    expect(initialLogs?.length).toBe(0);

    // 3. Simula chamada do Webhook do Mercado Pago com mock do fetch da API do MP
    const mockMpPayment = {
      id: 12345678,
      status: "approved",
      status_detail: "accredited",
      external_reference: saleId,
      transaction_amount: 15.0,
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation((url, options) => {
      const urlStr = typeof url === "string" ? url : url?.toString?.() || "";
      if (urlStr.includes("api.mercadopago.com")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockMpPayment,
        });
      }
      return originalFetch(url, options);
    });

    const webhookRequest = new Request("http://localhost:3000/api/webhooks/mercadopago", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "payment.updated",
        data: { id: "12345678" },
      }),
    });

    const webhookRes = await webhookHandler(webhookRequest);
    expect(webhookRes.status).toBe(200);

    // 4. Verifica se a venda foi para CONFIRMED
    const { data: saleAfter } = await admin
      .from("raffle_sales")
      .select("status")
      .eq("id", saleId)
      .single();
    expect(saleAfter?.status).toBe("CONFIRMED");

    // 5. Verifica auditoria gravada
    const { data: audit } = await admin
      .from("audit_logs")
      .select("action, new_data")
      .eq("entity_id", saleId)
      .eq("action", "SALE_APPROVED")
      .single();
    expect(audit?.action).toBe("SALE_APPROVED");
    expect((audit?.new_data as Record<string, unknown>)?.gateway).toBe("mercadopago");
    expect((audit?.new_data as Record<string, unknown>)?.auto_confirmed).toBe(true);

    // 6. Verifica endpoint de status
    const statusReq = new Request(`http://localhost:3000/api/mercadopago/status?saleId=${saleId}`);
    const statusRes = await statusHandler(statusReq);
    const statusData = await statusRes.json();
    expect(statusData.status).toBe("CONFIRMED");
  });
});
