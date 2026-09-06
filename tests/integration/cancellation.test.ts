import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { anonClient, adminClient } from "../helpers/supabase";

// Regression test for a real bug found during manual QA: rpc_cancel_sale's
// CASE expression wasn't being cast to point_status, causing every
// cancellation to fail with "column status is of type point_status but
// expression is of type text".
describe("sale cancellation", () => {
  const admin = adminClient();
  const raffleIds: string[] = [];
  let adminUserId: string;
  let adminSessionClient: ReturnType<typeof anonClient>;

  const testAdminEmail = `test-admin-${Date.now()}@teste.local`;
  const testAdminPassword = randomUUID();

  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email: testAdminEmail,
      password: testAdminPassword,
      email_confirm: true,
      user_metadata: { full_name: "Admin de Teste Automatizado", role: "ADMIN" },
    });
    if (error) throw error;
    adminUserId = data.user.id;

    adminSessionClient = anonClient();
    const { error: signInError } = await adminSessionClient.auth.signInWithPassword({
      email: testAdminEmail,
      password: testAdminPassword,
    });
    if (signInError) throw signInError;
  });

  afterAll(async () => {
    for (const raffleId of raffleIds) {
      const { data: sales } = await admin
        .from("raffle_sales")
        .select("id, buyer_id")
        .eq("raffle_id", raffleId);
      const saleIds = (sales ?? []).map((s) => s.id);
      const buyerIds = (sales ?? []).map((s) => s.buyer_id);
      if (saleIds.length > 0) {
        await admin.from("payment_records").delete().in("sale_id", saleIds);
        await admin.from("raffle_sale_points").delete().in("sale_id", saleIds);
        await admin.from("raffle_sales").delete().in("id", saleIds);
      }
      if (buyerIds.length > 0) {
        await admin.from("buyers").delete().in("id", buyerIds);
      }
      await admin.from("raffles").delete().eq("id", raffleId);
    }
    if (adminUserId) {
      await admin.auth.admin.deleteUser(adminUserId);
    }
  });

  async function createTestRaffle(totalPoints: number) {
    const slug = `teste-cancelamento-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const { data, error } = await admin
      .from("raffles")
      .insert({
        slug,
        title: "Rifa de teste (cancelamento)",
        total_points: totalPoints,
        unit_price_cents: 1000,
        starts_at: new Date(Date.now() - 3600_000).toISOString(),
        ends_at: new Date(Date.now() + 3600_000).toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;
    raffleIds.push(data.id);
    return data.id as string;
  }

  it("rejects cancellation from a non-admin session", async () => {
    const raffleId = await createTestRaffle(5);
    const client = anonClient();
    const token = randomUUID();

    await client.rpc("rpc_reserve_points", {
      p_raffle_id: raffleId,
      p_point_numbers: [1],
      p_reservation_token: token,
    });

    const { data: method } = await admin
      .from("payment_methods")
      .select("id")
      .eq("name", "Dinheiro")
      .single();

    const { data: receipt } = await client.rpc("rpc_confirm_sale", {
      p_raffle_id: raffleId,
      p_reservation_token: token,
      p_buyer_full_name: "Comprador Cancelamento",
      p_buyer_phone: "11999997777",
      p_buyer_whatsapp: "",
      p_buyer_instagram: "",
      p_buyer_notes: "",
      p_payment_method_id: method!.id,
      p_idempotency_key: randomUUID(),
    });
    const saleId = (receipt as { saleId: string }).saleId;

    const { error: rejectedError } = await client.rpc("rpc_cancel_sale", {
      p_sale_id: saleId,
      p_reason: "teste",
    });
    expect(rejectedError?.message).toMatch(/administradores/i);
  });

  it("cancels a confirmed sale and returns the point to AVAILABLE", async () => {
    const raffleId = await createTestRaffle(5);
    const client = anonClient();
    const token = randomUUID();

    await client.rpc("rpc_reserve_points", {
      p_raffle_id: raffleId,
      p_point_numbers: [2],
      p_reservation_token: token,
    });

    const { data: method } = await admin
      .from("payment_methods")
      .select("id")
      .eq("name", "Dinheiro")
      .single();

    const { data: receipt, error: confirmError } = await client.rpc(
      "rpc_confirm_sale",
      {
        p_raffle_id: raffleId,
        p_reservation_token: token,
        p_buyer_full_name: "Comprador Cancelamento",
        p_buyer_phone: "11999997777",
        p_buyer_whatsapp: "",
        p_buyer_instagram: "",
        p_buyer_notes: "",
        p_payment_method_id: method!.id,
        p_idempotency_key: randomUUID(),
      },
    );
    expect(confirmError).toBeNull();
    const saleId = (receipt as { saleId: string }).saleId;

    const { error: cancelError } = await adminSessionClient.rpc("rpc_cancel_sale", {
      p_sale_id: saleId,
      p_reason: "Comprador desistiu (teste automatizado)",
    });
    expect(cancelError).toBeNull();

    const { data: sale } = await admin
      .from("raffle_sales")
      .select("status, cancelled_reason")
      .eq("id", saleId)
      .single();
    expect(sale?.status).toBe("CANCELLED");
    expect(sale?.cancelled_reason).toMatch(/desistiu/i);

    const { data: point } = await admin
      .from("raffle_points")
      .select("status")
      .eq("raffle_id", raffleId)
      .eq("point_number", 2)
      .single();
    expect(point?.status).toBe("AVAILABLE");
  });
});
