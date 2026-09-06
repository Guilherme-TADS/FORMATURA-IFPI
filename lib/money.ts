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
  let normalized = value.trim();
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  } else if (normalized.includes(".")) {
    const parts = normalized.split(".");
    if (parts.length === 2 && (parts[1].length === 1 || parts[1].length === 2)) {
      // Dot is used as decimal separator (e.g. "1234.56" or "10.5")
    } else {
      // Dot is used as thousand separator (e.g. "1.234")
      normalized = normalized.replace(/\./g, "");
    }
  }

  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;

  const [, whole, fraction = ""] = match;
  const paddedFraction = (fraction + "00").slice(0, 2);
  return Number(whole) * 100 + Number(paddedFraction);
}
