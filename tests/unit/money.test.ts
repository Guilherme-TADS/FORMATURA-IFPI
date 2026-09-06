import { describe, it, expect } from "vitest";
import { brlStringToCents, centsToBRL } from "@/lib/money";

describe("Money utility (lib/money.ts)", () => {
  describe("brlStringToCents", () => {
    it("converts standard comma-delimited currency strings to cents", () => {
      expect(brlStringToCents("10,50")).toBe(1050);
      expect(brlStringToCents("0,05")).toBe(5);
      expect(brlStringToCents("1,00")).toBe(100);
      expect(brlStringToCents("99,99")).toBe(9999);
    });

    it("converts point-delimited currency strings to cents", () => {
      expect(brlStringToCents("10.50")).toBe(1050);
      expect(brlStringToCents("0.05")).toBe(5);
      expect(brlStringToCents("1.00")).toBe(100);
    });

    it("converts integer string values assuming no cents", () => {
      expect(brlStringToCents("10")).toBe(1000);
      expect(brlStringToCents("1")).toBe(100);
      expect(brlStringToCents("500")).toBe(50000);
      expect(brlStringToCents("0")).toBe(0);
    });

    it("converts single-digit fractional cents correctly", () => {
      expect(brlStringToCents("10,5")).toBe(1050);
      expect(brlStringToCents("19.9")).toBe(1990);
    });

    it("handles thousands separators without precision loss", () => {
      expect(brlStringToCents("1.234,56")).toBe(123456);
      expect(brlStringToCents("10.000,00")).toBe(1000000);
      expect(brlStringToCents("1.000.000,00")).toBe(100000000);
    });

    it("trims surrounding whitespace", () => {
      expect(brlStringToCents("   25,00   ")).toBe(2500);
      expect(brlStringToCents("\t50\n")).toBe(5000);
    });

    it("returns null for invalid inputs", () => {
      expect(brlStringToCents("")).toBeNull();
      expect(brlStringToCents("   ")).toBeNull();
      expect(brlStringToCents("abc")).toBeNull();
      expect(brlStringToCents("10,abc")).toBeNull();
      expect(brlStringToCents("-10")).toBeNull();
      expect(brlStringToCents("-10,50")).toBeNull();
      expect(brlStringToCents("10,999")).toBeNull(); // mais de 2 casas decimais
    });
  });

  describe("centsToBRL", () => {
    it("formats cent integers into Brazilian Real currency representation", () => {
      const formatted1050 = centsToBRL(1050);
      expect(formatted1050).toContain("10,50");
      expect(formatted1050).toContain("R$");

      const formatted0 = centsToBRL(0);
      expect(formatted0).toContain("0,00");

      const formatted5 = centsToBRL(5);
      expect(formatted5).toContain("0,05");

      const formattedMillion = centsToBRL(1000000);
      expect(formattedMillion).toContain("10.000,00");
    });
  });
});
