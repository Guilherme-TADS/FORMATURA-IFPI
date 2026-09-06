import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { anonClient, adminClient } from "../helpers/supabase";

// Fase 9: RBAC coverage per admin-only RPC. cancellation.test.ts already
// covers rpc_cancel_sale against an anonymous session; this file covers the
// remaining admin-only RPCs, and specifically against a VENDEDOR session
// (not just anon) — a logged-in non-admin is a materially different attack
// surface than an anonymous caller, since it exercises auth.uid() being set
// but is_admin() still being false.
describe("RBAC across admin-only RPCs and RLS policies", () => {
  const admin = adminClient();
  const raffleIds: string[] = [];
  const financialTransactionIds: string[] = [];
  const userIds: string[] = [];

  let vendedorClient: ReturnType<typeof anonClient>;
  let visualizadorClient: ReturnType<typeof anonClient>;

  beforeAll(async () => {
    const suffix = Date.now();
    const password = "senha-teste-rbac-1234";

    const vendedorEmail = `test-vendedor-${suffix}@teste.local`;
    const { data: vendedor, error: vendedorError } = await admin.auth.admin.createUser({
      email: vendedorEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Vendedor de Teste RBAC", role: "VENDEDOR" },
    });
    if (vendedorError) throw vendedorError;
    userIds.push(vendedor.user.id);

    const visualizadorEmail = `test-visualizador-${suffix}@teste.local`;
    const { data: visualizador, error: visualizadorError } = await admin.auth.admin.createUser({
      email: visualizadorEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Visualizador de Teste RBAC", role: "VISUALIZADOR" },
    });
    if (visualizadorError) throw visualizadorError;
    userIds.push(visualizador.user.id);

    vendedorClient = anonClient();
    const { error: vendedorSignInError } = await vendedorClient.auth.signInWithPassword({
      email: vendedorEmail,
      password,
    });
    if (vendedorSignInError) throw vendedorSignInError;

    visualizadorClient = anonClient();
    const { error: visualizadorSignInError } = await visualizadorClient.auth.signInWithPassword({
      email: visualizadorEmail,
      password,
    });
    if (visualizadorSignInError) throw visualizadorSignInError;
  });

  afterAll(async () => {
    for (const id of financialTransactionIds) {
      await admin.from("financial_transactions").delete().eq("id", id);
    }
    for (const raffleId of raffleIds) {
      // raffle_sales.raffle_id has no ON DELETE CASCADE (a sale must survive
      // its raffle being deleted in real usage) — the cancel_sale test below
      // creates a real sale, so it has to be torn down explicitly or the
      // raffle delete fails on the FK and silently leaves a fake "Rifa de
      // teste (RBAC)" visible on the public /rifas listing.
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
    for (const userId of userIds) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  async function createTestRaffle() {
    const slug = `teste-rbac-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const { data, error } = await admin
      .from("raffles")
      .insert({
        slug,
        title: "Rifa de teste (RBAC)",
        total_points: 5,
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

  async function createTestFinancialTransaction() {
    const { data: category } = await admin
      .from("financial_categories")
      .select("id")
      .eq("kind", "EXPENSE")
      .limit(1)
      .single();
    const { data, error } = await admin
      .from("financial_transactions")
      .insert({
        type: "EXPENSE",
        description: "Lançamento de teste (RBAC)",
        category_id: category!.id,
        amount_cents: 1000,
        occurred_on: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();
    if (error) throw error;
    financialTransactionIds.push(data.id);
    return data.id as string;
  }

  describe("rpc_close_raffle / rpc_cancel_raffle", () => {
    it.each([
      ["anônimo", () => anonClient()],
      ["vendedor", () => vendedorClient],
      ["visualizador", () => visualizadorClient],
    ])("rejects rpc_close_raffle from %s", async (_label, getClient) => {
      const raffleId = await createTestRaffle();
      const { error } = await getClient().rpc("rpc_close_raffle", { p_raffle_id: raffleId });
      expect(error?.message).toMatch(/administradores/i);
    });

    it.each([
      ["anônimo", () => anonClient()],
      ["vendedor", () => vendedorClient],
      ["visualizador", () => visualizadorClient],
    ])("rejects rpc_cancel_raffle from %s", async (_label, getClient) => {
      const raffleId = await createTestRaffle();
      const { error } = await getClient().rpc("rpc_cancel_raffle", {
        p_raffle_id: raffleId,
        p_reason: "teste",
      });
      expect(error?.message).toMatch(/administradores/i);
    });
  });

  describe("rpc_cancel_sale", () => {
    it("rejects a vendedor session (not just anon)", async () => {
      const raffleId = await createTestRaffle();
      const token = randomUUID();
      await vendedorClient.rpc("rpc_reserve_points", {
        p_raffle_id: raffleId,
        p_point_numbers: [1],
        p_reservation_token: token,
      });
      const { data: method } = await admin.from("payment_methods").select("id").eq("name", "Dinheiro").single();
      const { data: receipt } = await vendedorClient.rpc("rpc_confirm_sale", {
        p_raffle_id: raffleId,
        p_reservation_token: token,
        p_buyer_full_name: "Comprador Teste RBAC",
        p_buyer_phone: "11999990000",
        p_buyer_whatsapp: "",
        p_buyer_instagram: "",
        p_buyer_notes: "",
        p_payment_method_id: method!.id,
        p_idempotency_key: randomUUID(),
      });
      const saleId = (receipt as { saleId: string }).saleId;

      const { error } = await vendedorClient.rpc("rpc_cancel_sale", {
        p_sale_id: saleId,
        p_reason: "teste",
      });
      expect(error?.message).toMatch(/administradores/i);
    });
  });

  describe("rpc_update_financial_transaction / rpc_delete_financial_transaction", () => {
    it.each([
      ["anônimo", () => anonClient()],
      ["vendedor", () => vendedorClient],
      ["visualizador", () => visualizadorClient],
    ])("rejects rpc_update_financial_transaction from %s", async (_label, getClient) => {
      const id = await createTestFinancialTransaction();
      const { error } = await getClient().rpc("rpc_update_financial_transaction", {
        p_id: id,
        p_description: "Tentativa não autorizada",
        p_category_id: randomUUID(),
        p_amount_cents: 5000,
        p_occurred_on: new Date().toISOString().slice(0, 10),
        p_reason: "teste rbac",
      });
      expect(error?.message).toMatch(/administradores/i);
    });

    it.each([
      ["anônimo", () => anonClient()],
      ["vendedor", () => vendedorClient],
      ["visualizador", () => visualizadorClient],
    ])("rejects rpc_delete_financial_transaction from %s", async (_label, getClient) => {
      const id = await createTestFinancialTransaction();
      const { error } = await getClient().rpc("rpc_delete_financial_transaction", {
        p_id: id,
        p_reason: "teste rbac",
      });
      expect(error?.message).toMatch(/administradores/i);
    });
  });

  describe("financial_transactions RLS (direct table access, not via RPC)", () => {
    it("blocks a vendedor from inserting a financial transaction directly", async () => {
      const { data: category } = await admin
        .from("financial_categories")
        .select("id")
        .eq("kind", "INCOME")
        .limit(1)
        .single();
      const { error } = await vendedorClient.from("financial_transactions").insert({
        type: "INCOME",
        description: "Tentativa direta não autorizada",
        category_id: category!.id,
        amount_cents: 1000,
        occurred_on: new Date().toISOString().slice(0, 10),
      });
      expect(error).not.toBeNull();
    });

    it("hides financial_transactions from an anonymous reader (RLS filters rows, no error)", async () => {
      const { data, error } = await anonClient().from("financial_transactions").select("id").limit(1);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("hides financial_transactions from a vendedor reader too (select policy is admin/visualizador only)", async () => {
      const { data, error } = await vendedorClient.from("financial_transactions").select("id").limit(1);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("allows a visualizador to read financial_transactions", async () => {
      await createTestFinancialTransaction();
      const { data, error } = await visualizadorClient.from("financial_transactions").select("id").limit(1);
      expect(error).toBeNull();
      expect(data!.length).toBeGreaterThan(0);
    });
  });
});
