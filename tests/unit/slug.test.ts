import { describe, it, expect } from "vitest";
import { slugify } from "@/lib/slug";

// Constraint do banco de dados (tabela raffles):
// check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
const POSTGRES_SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe("Slug utility (lib/slug.ts)", () => {
  it("converts simple phrases to lowercase hyphen-separated slugs", () => {
    const slug = slugify("Rifa de Formatura TADS");
    expect(slug).toBe("rifa-de-formatura-tads");
    expect(slug).toMatch(POSTGRES_SLUG_REGEX);
  });

  it("removes accents, tildes, and cedilhas correctly", () => {
    const slug = slugify("Rifa de Páscoa, São João & Réveillon");
    expect(slug).toBe("rifa-de-pascoa-sao-joao-reveillon");
    expect(slug).toMatch(POSTGRES_SLUG_REGEX);
  });

  it("removes special symbols and punctuation", () => {
    const slug = slugify("Rifa #1 — Prêmio: R$ 5.000,00 (Imperdível!)");
    expect(slug).toBe("rifa-1-premio-r-5-000-00-imperdivel");
    expect(slug).toMatch(POSTGRES_SLUG_REGEX);
  });

  it("collapses multiple spaces or hyphens into a single hyphen", () => {
    const slug = slugify("Rifa    Com     Muitos    Espacos");
    expect(slug).toBe("rifa-com-muitos-espacos");
    expect(slug).toMatch(POSTGRES_SLUG_REGEX);
  });

  it("trims leading and trailing hyphens and whitespace", () => {
    const slug = slugify("   ---Rifa Especial 2026---   ");
    expect(slug).toBe("rifa-especial-2026");
    expect(slug).toMatch(POSTGRES_SLUG_REGEX);
  });

  it("handles alphanumeric combinations", () => {
    const slug = slugify("iPhone 16 Pro Max 256GB");
    expect(slug).toBe("iphone-16-pro-max-256gb");
    expect(slug).toMatch(POSTGRES_SLUG_REGEX);
  });
});
