import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { anonClient, adminClient } from "../helpers/supabase";

describe("Deletion & Voluntary Release Integration Tests", () => {
  const admin = adminClient();
  const createdRaffleIds: string[] = [];
  const createdCategoryIds: string[] = [];

  afterAll(async () => {
    // Limpeza de rifas criadas durante os testes
    for (const raffleId of createdRaffleIds) {
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
      await admin.from("raffle_points").delete().eq("raffle_id", raffleId);
      await admin.from("raffles").delete().eq("id", raffleId);
    }

    // Limpeza de categorias criadas
    for (const catId of createdCategoryIds) {
      await admin.from("financial_transactions").delete().eq("category_id", catId);
      await admin.from("financial_categories").delete().eq("id", catId);
    }
  });

  describe("financial category deletion rules", () => {
    it("allows deleting an unused category with zero transactions", async () => {
      const name = `Categoria Teste Deletavel ${Date.now()}`;
      const { data: cat, error } = await admin
        .from("financial_categories")
        .insert({ kind: "EXPENSE", name })
        .select("id")
        .single();

      expect(error).toBeNull();
      expect(cat?.id).toBeDefined();

      // Confere que há 0 lançamentos
      const { count } = await admin
        .from("financial_transactions")
        .select("id", { count: "exact", head: true })
        .eq("category_id", cat!.id);
      expect(count).toBe(0);

      // Exclui a categoria
      const { error: deleteError } = await admin
        .from("financial_categories")
        .delete()
        .eq("id", cat!.id);

      expect(deleteError).toBeNull();

      // Confirma que não existe mais
      const { data: check } = await admin
        .from("financial_categories")
        .select("id")
        .eq("id", cat!.id)
        .maybeSingle();

      expect(check).toBeNull();
    });

    it("blocks deletion of a category that has linked financial transactions", async () => {
      const name = `Categoria Bloqueada ${Date.now()}`;
      const { data: cat } = await admin
        .from("financial_categories")
        .insert({ kind: "INCOME", name })
        .select("id")
        .single();

      createdCategoryIds.push(cat!.id);

      // Insere uma movimentação vinculada
      const { error: txError } = await admin
        .from("financial_transactions")
        .insert({
          type: "INCOME",
          description: "Lançamento de teste de integridade",
          category_id: cat!.id,
          amount_cents: 10000,
          occurred_on: "2026-09-06",
        });

      expect(txError).toBeNull();

      // Tenta deletar diretamente no banco — o banco deve recusar por chave estrangeira
      const { error: deleteError } = await admin
        .from("financial_categories")
        .delete()
        .eq("id", cat!.id);

      // Violação de Foreign Key constraint (code 23503)
      expect(deleteError).not.toBeNull();
      expect(deleteError?.code).toBe("23503");
    });
  });

  describe("raffle deletion rules", () => {
    it("allows permanently deleting a raffle and its points if it has zero sales", async () => {
      const slug = `rifa-deletavel-${Date.now()}`;
      const { data: raffle, error: createError } = await admin
        .from("raffles")
        .insert({
          slug,
          title: "Rifa Deletável sem vendas",
          total_points: 10,
          unit_price_cents: 500,
          starts_at: new Date(Date.now() - 3600_000).toISOString(),
          ends_at: new Date(Date.now() + 3600_000).toISOString(),
        })
        .select("id")
        .single();

      expect(createError).toBeNull();
      const raffleId = raffle!.id;

      // Confere que gerou 10 pontos
      const { count: pointsCount } = await admin
        .from("raffle_points")
        .select("id", { count: "exact", head: true })
        .eq("raffle_id", raffleId);
      expect(pointsCount).toBe(10);

      // Deleta os pontos e a rifa
      const { error: deletePointsError } = await admin
        .from("raffle_points")
        .delete()
        .eq("raffle_id", raffleId);
      expect(deletePointsError).toBeNull();

      const { error: deleteRaffleError } = await admin
        .from("raffles")
        .delete()
        .eq("id", raffleId);
      expect(deleteRaffleError).toBeNull();

      // Confirma que não existe mais
      const { data: check } = await admin
        .from("raffles")
        .select("id")
        .eq("id", raffleId)
        .maybeSingle();
      expect(check).toBeNull();
    });
  });

  describe("voluntary reservation cancellation and point release", () => {
    it("immediately releases reserved points back to AVAILABLE on cancellation", async () => {
      const slug = `rifa-liberacao-${Date.now()}`;
      const { data: raffle } = await admin
        .from("raffles")
        .insert({
          slug,
          title: "Rifa para teste de liberação",
          total_points: 5,
          unit_price_cents: 1000,
          starts_at: new Date(Date.now() - 3600_000).toISOString(),
          ends_at: new Date(Date.now() + 3600_000).toISOString(),
        })
        .select("id")
        .single();

      const raffleId = raffle!.id;
      createdRaffleIds.push(raffleId);

      const client = anonClient();
      const token = randomUUID();

      // 1. Reserva o ponto número 1
      const { data: reserved, error: reserveError } = await client.rpc(
        "rpc_reserve_points",
        {
          p_raffle_id: raffleId,
          p_point_numbers: [1],
          p_reservation_token: token,
          p_ttl_minutes: 15,
        },
      );

      expect(reserveError).toBeNull();
      expect(reserved?.[0]?.point_number).toBe(1);

      // Confirma no banco que o ponto está RESERVED
      const { data: pointBefore } = await admin
        .from("raffle_points")
        .select("status, reservation_token")
        .eq("raffle_id", raffleId)
        .eq("point_number", 1)
        .single();

      expect(pointBefore?.status).toBe("RESERVED");
      expect(pointBefore?.reservation_token).toBe(token);

      // 2. Executa a liberação voluntária (mesma lógica da Server Action releaseReservation)
      const { error: releaseError } = await admin
        .from("raffle_points")
        .update({
          status: "AVAILABLE",
          reserved_until: null,
          reservation_token: null,
        })
        .eq("raffle_id", raffleId)
        .eq("reservation_token", token)
        .eq("status", "RESERVED");

      expect(releaseError).toBeNull();

      // 3. Verifica que o ponto voltou para AVAILABLE e o token foi limpo
      const { data: pointAfter } = await admin
        .from("raffle_points")
        .select("status, reservation_token, reserved_until")
        .eq("raffle_id", raffleId)
        .eq("point_number", 1)
        .single();

      expect(pointAfter?.status).toBe("AVAILABLE");
      expect(pointAfter?.reservation_token).toBeNull();
      expect(pointAfter?.reserved_until).toBeNull();

      // 4. Um segundo cliente agora consegue reservar o mesmo ponto 1 imediatamente
      const secondClient = anonClient();
      const secondToken = randomUUID();

      const { data: secondReserve, error: secondReserveError } = await secondClient.rpc(
        "rpc_reserve_points",
        {
          p_raffle_id: raffleId,
          p_point_numbers: [1],
          p_reservation_token: secondToken,
          p_ttl_minutes: 15,
        },
      );

      expect(secondReserveError).toBeNull();
      expect(secondReserve?.[0]?.point_number).toBe(1);
    });
  });
});
