import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { raffleFormSchema } from "@/lib/schemas/raffle";
import { buyerFormSchema } from "@/lib/schemas/checkout";
import { transactionFormSchema, editTransactionSchema } from "@/lib/schemas/financial";

describe("Zod Validation Schemas (lib/schemas/)", () => {
  describe("raffleFormSchema", () => {
    const validRaffle = {
      title: "Rifa de Formatura 2026",
      slug: "rifa-de-formatura-2026",
      description: "Prêmio: Notebook Dell",
      rules: "Sorteio pela Loteria Federal",
      imageUrl: "https://example.com/foto.jpg",
      totalPoints: 500,
      unitPriceLabel: "10,00",
      startsAt: "2026-09-01T10:00:00.000Z",
      endsAt: "2026-10-01T10:00:00.000Z",
      googleSheetUrl: "https://docs.google.com/spreadsheets/d/123",
      internalNotes: "Aprovado pela comissão",
    };

    it("accepts valid raffle data", () => {
      const result = raffleFormSchema.safeParse(validRaffle);
      expect(result.success).toBe(true);
    });

    it("rejects when endsAt is before or equal to startsAt", () => {
      const invalidDates = {
        ...validRaffle,
        startsAt: "2026-10-01T10:00:00.000Z",
        endsAt: "2026-09-01T10:00:00.000Z",
      };
      const result = raffleFormSchema.safeParse(invalidDates);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(
          "data de encerramento deve ser depois da data de início",
        );
      }
    });

    it("rejects totalPoints out of bounds (<= 0 or > 100000)", () => {
      expect(raffleFormSchema.safeParse({ ...validRaffle, totalPoints: 0 }).success).toBe(false);
      expect(raffleFormSchema.safeParse({ ...validRaffle, totalPoints: 100001 }).success).toBe(false);
    });

    it("rejects invalid slugs (uppercase, special chars, trailing hyphens)", () => {
      expect(raffleFormSchema.safeParse({ ...validRaffle, slug: "Rifa_Teste" }).success).toBe(false);
      expect(raffleFormSchema.safeParse({ ...validRaffle, slug: "rifa-teste-" }).success).toBe(false);
      expect(raffleFormSchema.safeParse({ ...validRaffle, slug: "-rifa-teste" }).success).toBe(false);
      expect(raffleFormSchema.safeParse({ ...validRaffle, slug: "rifa--teste" }).success).toBe(false);
    });

    it("allows empty string for optional imageUrl and googleSheetUrl", () => {
      const withEmptyUrls = {
        ...validRaffle,
        imageUrl: "",
        googleSheetUrl: "",
      };
      expect(raffleFormSchema.safeParse(withEmptyUrls).success).toBe(true);
    });
  });

  describe("buyerFormSchema", () => {
    const validBuyer = {
      fullName: "Maria dos Santos",
      phone: "(86) 99999-8888",
      whatsapp: "(86) 99999-8888",
      instagram: "@mariasantos",
      paymentMethodId: randomUUID(),
    };

    it("accepts valid buyer checkout data", () => {
      const result = buyerFormSchema.safeParse(validBuyer);
      expect(result.success).toBe(true);
    });

    it("rejects short names (< 3 chars)", () => {
      const result = buyerFormSchema.safeParse({ ...validBuyer, fullName: "Zé" });
      expect(result.success).toBe(false);
    });

    it("rejects phones with letters or invalid characters", () => {
      const result = buyerFormSchema.safeParse({ ...validBuyer, phone: "99999-abcd" });
      expect(result.success).toBe(false);
    });

    it("rejects invalid paymentMethodId non-UUID", () => {
      const result = buyerFormSchema.safeParse({ ...validBuyer, paymentMethodId: "not-a-uuid" });
      expect(result.success).toBe(false);
    });
  });

  describe("financialFormSchema & editTransactionSchema", () => {
    it("validates transaction creation schema", () => {
      const validTx = {
        description: "Compra de copos descartáveis",
        categoryId: randomUUID(),
        amountLabel: "45,90",
        occurredOn: "2026-09-05",
      };
      expect(transactionFormSchema.safeParse(validTx).success).toBe(true);

      const invalidDesc = { ...validTx, description: "Oi" };
      expect(transactionFormSchema.safeParse(invalidDesc).success).toBe(false);

      const invalidCategory = { ...validTx, categoryId: "123" };
      expect(transactionFormSchema.safeParse(invalidCategory).success).toBe(false);
    });

    it("requires reason for editing transaction in editTransactionSchema", () => {
      const validEdit = {
        description: "Compra de copos descartáveis",
        categoryId: randomUUID(),
        amountLabel: "50,00",
        occurredOn: "2026-09-05",
        reason: "Correção no valor da nota fiscal",
      };
      expect(editTransactionSchema.safeParse(validEdit).success).toBe(true);

      const noReason = { ...validEdit, reason: "" };
      expect(editTransactionSchema.safeParse(noReason).success).toBe(false);
    });
  });
});
