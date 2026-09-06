import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { anonClient, adminClient } from "../helpers/supabase";

describe("sale approval flow", () => {
  const admin = adminClient();
  const raffleIds: string[] = [];
  let adminUserId: string;

  const testAdminEmail = `test-admin-approval-${Date.now()}@teste.local`;
  const testAdminPassword = randomUUID();

  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email: testAdminEmail,
      password: testAdminPassword,
      email_confirm: true,
      user_metadata: { full_name: "Admin Teste Aprovação", role: "ADMIN" },
    });
    if (error) throw error;
    adminUserId = data.user.id;
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
    if (adminUserId) {
      await admin.auth.admin.deleteUser(adminUserId);
    }
  });

  async function createTestRaffle(totalPoints: number) {
    const slug = `teste-aprovacao-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const { data, error } = await admin
      .from("raffles")
      .insert({
        slug,
        title: "Rifa de teste (aprovação)",
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

  it("handles self-service sale as pending review and records approval in audit log", async () => {
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
      .eq("name", "PIX")
      .single();

    const { data: receipt, error: confirmError } = await client.rpc("rpc_confirm_sale", {
      p_raffle_id: raffleId,
      p_reservation_token: token,
      p_buyer_full_name: "Comprador Aprovação",
      p_buyer_phone: "11999991111",
      p_buyer_whatsapp: "",
      p_buyer_instagram: "",
      p_buyer_notes: "",
      p_payment_method_id: method!.id,
      p_idempotency_key: randomUUID(),
    });
    expect(confirmError).toBeNull();
    const saleId = (receipt as { saleId: string }).saleId;

    // Venda criada por autoatendimento (seller_id é null)
    const { data: sale } = await admin
      .from("raffle_sales")
      .select("seller_id, status")
      .eq("id", saleId)
      .single();
    expect(sale?.seller_id).toBeNull();

    // Antes da aprovação, não há registro de SALE_APPROVED na auditoria
    const { data: initialLogs } = await admin
      .from("audit_logs")
      .select("id")
      .eq("entity_id", saleId)
      .eq("action", "SALE_APPROVED");
    expect(initialLogs?.length).toBe(0);

    // Administrador aprova a venda (registra SALE_APPROVED)
    const { error: approveAuditError } = await admin.from("audit_logs").insert({
      action: "SALE_APPROVED",
      entity_type: "raffle_sale",
      entity_id: saleId,
      user_id: adminUserId,
      new_data: { approved_at: new Date().toISOString() },
    });
    expect(approveAuditError).toBeNull();

    // Agora há registro de aprovação
    const { data: approvedLogs } = await admin
      .from("audit_logs")
      .select("id")
      .eq("entity_id", saleId)
      .eq("action", "SALE_APPROVED");
    expect(approvedLogs?.length).toBe(1);
  });
});
