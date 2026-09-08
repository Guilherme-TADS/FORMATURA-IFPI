import { describe, it, expect } from "vitest";
import {
  normalizePhoneDigits,
  formatPhone,
  getPhoneSearchPattern,
  isPhoneMatch,
} from "@/lib/phone";

describe("Phone utilities (lib/phone.ts)", () => {
  describe("normalizePhoneDigits", () => {
    it("normalizes a 11-digit mobile phone with DDD", () => {
      expect(normalizePhoneDigits("(86) 98888-7777")).toBe("86988887777");
      expect(normalizePhoneDigits("86988887777")).toBe("86988887777");
    });

    it("normalizes a 10-digit landline phone with DDD", () => {
      expect(normalizePhoneDigits("(86) 3222-1234")).toBe("8632221234");
      expect(normalizePhoneDigits("8632221234")).toBe("8632221234");
    });

    it("strips country code 55 when followed by 10 or 11 digits", () => {
      expect(normalizePhoneDigits("+55 (86) 98888-7777")).toBe("86988887777");
      expect(normalizePhoneDigits("5586988887777")).toBe("86988887777");
      expect(normalizePhoneDigits("558632221234")).toBe("8632221234");
    });

    it("returns null for numbers without DDD or incomplete numbers", () => {
      expect(normalizePhoneDigits("98888-7777")).toBeNull();
      expect(normalizePhoneDigits("88887777")).toBeNull();
      expect(normalizePhoneDigits("123")).toBeNull();
      expect(normalizePhoneDigits("")).toBeNull();
    });

    it("returns null for numbers that are too long", () => {
      expect(normalizePhoneDigits("5586988887777999")).toBeNull();
    });
  });

  describe("formatPhone", () => {
    it("formats 11-digit mobile phones progressively", () => {
      expect(formatPhone("86")).toBe("86");
      expect(formatPhone("869")).toBe("(86) 9");
      expect(formatPhone("8698888")).toBe("(86) 9888-8");
      expect(formatPhone("86988887777")).toBe("(86) 98888-7777");
    });

    it("formats 10-digit landlines", () => {
      expect(formatPhone("8632221234")).toBe("(86) 3222-1234");
    });

    it("strips +55 if pasted by the user", () => {
      expect(formatPhone("+5586988887777")).toBe("(86) 98888-7777");
    });
  });

  describe("getPhoneSearchPattern", () => {
    it("decomposes 11-digit mobile correctly", () => {
      const pattern = getPhoneSearchPattern("86988887777");
      expect(pattern.ddd).toBe("86");
      expect(pattern.last8).toBe("88887777");
      expect(pattern.part1).toBe("8888");
      expect(pattern.part2).toBe("7777");
    });

    it("decomposes 10-digit landline correctly", () => {
      const pattern = getPhoneSearchPattern("8632221234");
      expect(pattern.ddd).toBe("86");
      expect(pattern.last8).toBe("32221234");
      expect(pattern.part1).toBe("3222");
      expect(pattern.part2).toBe("1234");
    });
  });

  describe("isPhoneMatch (cross-DDD leak prevention)", () => {
    it("matches identical numbers across different formats", () => {
      expect(isPhoneMatch("(86) 98888-7777", "86988887777")).toBe(true);
      expect(isPhoneMatch("86 98888-7777", "86988887777")).toBe(true);
      expect(isPhoneMatch("+55 (86) 98888-7777", "86988887777")).toBe(true);
      expect(isPhoneMatch("86988887777", "86988887777")).toBe(true);
    });

    it("PREVENTS leak when two numbers share the same last 8 digits but have DIFFERENT DDDs", () => {
      // DDD 86 vs DDD 11
      expect(isPhoneMatch("(86) 98888-7777", "11988887777")).toBe(false);
      expect(isPhoneMatch("(11) 98888-7777", "86988887777")).toBe(false);
      // DDD 21 vs DDD 86
      expect(isPhoneMatch("(21) 98888-7777", "86988887777")).toBe(false);
    });

    it("allows match between 10-digit and 11-digit variations in the same DDD", () => {
      // Stored with 9, searched without 9
      expect(isPhoneMatch("(86) 98888-7777", "8688887777")).toBe(true);
      // Stored without 9, searched with 9
      expect(isPhoneMatch("(86) 8888-7777", "86988887777")).toBe(true);
    });

    it("rejects when numbers in the same DDD have different digits", () => {
      expect(isPhoneMatch("(86) 98888-7777", "86988886666")).toBe(false);
      expect(isPhoneMatch("(86) 91111-2222", "86933332222")).toBe(false);
    });

    it("returns false for invalid or null inputs", () => {
      expect(isPhoneMatch(null, "86988887777")).toBe(false);
      expect(isPhoneMatch(undefined, "86988887777")).toBe(false);
      expect(isPhoneMatch("", "86988887777")).toBe(false);
      expect(isPhoneMatch("invalid", "86988887777")).toBe(false);
    });
  });
});
