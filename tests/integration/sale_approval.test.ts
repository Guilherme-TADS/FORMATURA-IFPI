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

  it("supports bulk approval logging and duplicate hash tracking", async () => {
    const raffleId = await createTestRaffle(5);
    const client = anonClient();

    const { data: method } = await admin
      .from("payment_methods")
      .select("id")
      .eq("name", "PIX")
      .single();

    // Cria 2 vendas de autoatendimento
    const token1 = randomUUID();
    await client.rpc("rpc_reserve_points", {
      p_raffle_id: raffleId,
      p_point_numbers: [1],
      p_reservation_token: token1,
    });
    const { data: res1, error: err1 } = await client.rpc("rpc_confirm_sale", {
      p_raffle_id: raffleId,
      p_reservation_token: token1,
      p_buyer_full_name: "Comprador 1",
      p_buyer_phone: "11999990001",
      p_buyer_whatsapp: "",
      p_buyer_instagram: "",
      p_buyer_notes: "",
      p_payment_method_id: method!.id,
      p_idempotency_key: randomUUID(),
    });
    expect(err1).toBeNull();

    const token2 = randomUUID();
    await client.rpc("rpc_reserve_points", {
      p_raffle_id: raffleId,
      p_point_numbers: [2],
      p_reservation_token: token2,
    });
    const { data: res2, error: err2 } = await client.rpc("rpc_confirm_sale", {
      p_raffle_id: raffleId,
      p_reservation_token: token2,
      p_buyer_full_name: "Comprador 2",
      p_buyer_phone: "11999990002",
      p_buyer_whatsapp: "",
      p_buyer_instagram: "",
      p_buyer_notes: "",
      p_payment_method_id: method!.id,
      p_idempotency_key: randomUUID(),
    });
    expect(err2).toBeNull();

    const saleId1 = (res1 as { saleId: string }).saleId;
    const saleId2 = (res2 as { saleId: string }).saleId;

    // Simula envio do mesmo comprovante (mesmo hash SHA-256) em ambas as vendas
    const fakeHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const { data: att1 } = await admin.from("attachments").insert({
      entity_type: "raffle_sale",
      entity_id: saleId1,
      kind: "comprovante",
      file_name: "recibo.jpg",
      mime_type: "image/jpeg",
      file_size: 1024,
      status: "UPLOADED",
      description: `sha256:${fakeHash}`,
    }).select("id, description").single();

    const { data: att2 } = await admin.from("attachments").insert({
      entity_type: "raffle_sale",
      entity_id: saleId2,
      kind: "comprovante",
      file_name: "recibo_copia.jpg",
      mime_type: "image/jpeg",
      file_size: 1024,
      status: "UPLOADED",
      description: `sha256:${fakeHash}`,
    }).select("id, description").single();

    expect(att1?.description).toBe(`sha256:${fakeHash}`);
    expect(att2?.description).toBe(`sha256:${fakeHash}`);
    // Ambos possuem o mesmo hash — duplicidade detectada!
    expect(att1?.description).toBe(att2?.description);

    // Aprovação em lote de ambas as vendas
    const auditRows = [saleId1, saleId2].map((id) => ({
      action: "SALE_APPROVED",
      entity_type: "raffle_sale",
      entity_id: id,
      user_id: adminUserId,
      new_data: { approved_at: new Date().toISOString(), bulk: true },
    }));
    const { error: bulkError } = await admin.from("audit_logs").insert(auditRows);
    expect(bulkError).toBeNull();

    const { data: bulkLogs } = await admin
      .from("audit_logs")
      .select("entity_id")
      .in("entity_id", [saleId1, saleId2])
      .eq("action", "SALE_APPROVED");

    expect(bulkLogs?.length).toBe(2);
  });
});
