// Money is always an integer number of cents everywhere in this app — never
// a JS float. These are the only two places that convert to/from a decimal
// string for display or form input.

export function centsToBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Parses a "1234,56" / "1234.56" / "1234" pt-BR style decimal string into
 * integer cents without going through floating point multiplication (which
 * can misround values like 19.9 * 100).
 */
export function brlStringToCents(value: string): number | null {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;

  const [, whole, fraction = ""] = match;
  const paddedFraction = (fraction + "00").slice(0, 2);
  return Number(whole) * 100 + Number(paddedFraction);
}
