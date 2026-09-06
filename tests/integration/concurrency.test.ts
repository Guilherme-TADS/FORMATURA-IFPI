import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { anonClient, adminClient } from "../helpers/supabase";

// These tests hit the real, linked Supabase project (no local Postgres in
// this environment). They create and tear down their own throwaway raffle so
// they're safe to run against the project the app actually uses.
describe("raffle point concurrency", () => {
  const admin = adminClient();
  const raffleIds: string[] = [];

  async function createTestRaffle(totalPoints: number) {
    const slug = `teste-concorrencia-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const { data, error } = await admin
      .from("raffles")
      .insert({
        slug,
        title: "Rifa de teste (concorrência)",
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
  });

  it("only lets one of two simultaneous requests reserve the same point", async () => {
    const raffleId = await createTestRaffle(5);
    const clientA = anonClient();
    const clientB = anonClient();

    const [resultA, resultB] = await Promise.all([
      clientA.rpc("rpc_reserve_points", {
        p_raffle_id: raffleId,
        p_point_numbers: [1],
        p_reservation_token: randomUUID(),
      }),
      clientB.rpc("rpc_reserve_points", {
        p_raffle_id: raffleId,
        p_point_numbers: [1],
        p_reservation_token: randomUUID(),
      }),
    ]);

    const outcomes = [resultA, resultB];
    const succeeded = outcomes.filter((r) => !r.error);
    const failed = outcomes.filter((r) => r.error);

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0].error?.message).toMatch(/reservados por outra pessoa/i);
  });

  it("double-confirming with the same idempotency key never creates two sales", async () => {
    const raffleId = await createTestRaffle(5);
    const client = anonClient();
    const token = randomUUID();
    const idempotencyKey = randomUUID();

    const { error: reserveError } = await client.rpc("rpc_reserve_points", {
      p_raffle_id: raffleId,
      p_point_numbers: [2],
      p_reservation_token: token,
    });
    expect(reserveError).toBeNull();

    const { data: methods } = await admin
      .from("payment_methods")
      .select("id")
      .eq("name", "Dinheiro")
      .single();

    const confirmArgs = {
      p_raffle_id: raffleId,
      p_reservation_token: token,
      p_buyer_full_name: "Comprador Teste",
      p_buyer_phone: "11999998888",
      p_buyer_whatsapp: "",
      p_buyer_instagram: "",
      p_buyer_notes: "",
      p_payment_method_id: methods!.id,
      p_idempotency_key: idempotencyKey,
    };

    const [saleA, saleB] = await Promise.all([
      client.rpc("rpc_confirm_sale", confirmArgs),
      client.rpc("rpc_confirm_sale", confirmArgs),
    ]);

    expect(saleA.error).toBeNull();
    expect(saleB.error).toBeNull();
    expect((saleA.data as { saleId: string })?.saleId).toBe(
      (saleB.data as { saleId: string })?.saleId,
    );

    const { count } = await admin
      .from("raffle_sales")
      .select("id", { count: "exact", head: true })
      .eq("idempotency_key", idempotencyKey);
    expect(count).toBe(1);
  });

  it("rejects confirmation once the reservation has expired", async () => {
    const raffleId = await createTestRaffle(5);
    const client = anonClient();
    const token = randomUUID();

    await client.rpc("rpc_reserve_points", {
      p_raffle_id: raffleId,
      p_point_numbers: [3],
      p_reservation_token: token,
    });

    // Simulate the reservation having expired a minute ago, before the
    // cron job had a chance to sweep it — rpc_confirm_sale must catch this
    // itself rather than trusting the RESERVED status alone.
    await admin
      .from("raffle_points")
      .update({ reserved_until: new Date(Date.now() - 60_000).toISOString() })
      .eq("raffle_id", raffleId)
      .eq("point_number", 3);

    const { data: methods } = await admin
      .from("payment_methods")
      .select("id")
      .eq("name", "Dinheiro")
      .single();

    const { error } = await client.rpc("rpc_confirm_sale", {
      p_raffle_id: raffleId,
      p_reservation_token: token,
      p_buyer_full_name: "Comprador Teste",
      p_buyer_phone: "11999998888",
      p_buyer_whatsapp: "",
      p_buyer_instagram: "",
      p_buyer_notes: "",
      p_payment_method_id: methods!.id,
      p_idempotency_key: randomUUID(),
    });

    expect(error?.message).toMatch(/reserva expirou/i);
  });

  it("refuses to reserve points on a raffle that is not OPEN", async () => {
    const raffleId = await createTestRaffle(5);
    await admin.from("raffles").update({ status: "CLOSED" }).eq("id", raffleId);

    const client = anonClient();
    const { error } = await client.rpc("rpc_reserve_points", {
      p_raffle_id: raffleId,
      p_point_numbers: [4],
      p_reservation_token: randomUUID(),
    });

    expect(error?.message).toMatch(/não está aberta/i);
  });

  it("never sells the same point twice even under concurrent full checkouts", async () => {
    const raffleId = await createTestRaffle(5);
    const { data: methods } = await admin
      .from("payment_methods")
      .select("id")
      .eq("name", "Dinheiro")
      .single();

    async function attemptFullCheckout() {
      const client = anonClient();
      const token = randomUUID();
      const reserve = await client.rpc("rpc_reserve_points", {
        p_raffle_id: raffleId,
        p_point_numbers: [5],
        p_reservation_token: token,
      });
      if (reserve.error) return { reserved: false, sold: false };

      const confirm = await client.rpc("rpc_confirm_sale", {
        p_raffle_id: raffleId,
        p_reservation_token: token,
        p_buyer_full_name: `Comprador ${token}`,
        p_buyer_phone: "11988887777",
        p_buyer_whatsapp: "",
        p_buyer_instagram: "",
        p_buyer_notes: "",
        p_payment_method_id: methods!.id,
        p_idempotency_key: randomUUID(),
      });
      return { reserved: true, sold: !confirm.error };
    }

    const results = await Promise.all(
      Array.from({ length: 5 }, () => attemptFullCheckout()),
    );

    expect(results.filter((r) => r.reserved && r.sold)).toHaveLength(1);

    const { data: point } = await admin
      .from("raffle_points")
      .select("status")
      .eq("raffle_id", raffleId)
      .eq("point_number", 5)
      .single();
    expect(point?.status).toBe("SOLD");
  });
});
