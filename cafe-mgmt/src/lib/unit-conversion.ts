/**
 * Within-dimension unit conversion. Display-only — used to render inventory
 * quantities in a manager-preferred unit while storage stays in the
 * ingredient's `unit` field.
 *
 * Each unit maps to a base via a multiplier:
 *   Mass: base = `g`. e.g., kg = 1000 g.
 *   Volume: base = `mL`. e.g., L = 1000 mL.
 *   Count: base = `each`. e.g., dozen = 12 each.
 *
 * Cross-dimension conversion is undefined (no density lookup) and rejected.
 */

export type Dimension = "mass" | "volume" | "count";

interface UnitDef {
  dimension: Dimension;
  /** Multiplier to base unit (g, mL, or each). */
  toBase: number;
}

const UNIT_TABLE: Record<string, UnitDef> = {
  // Mass (base: g)
  g: { dimension: "mass", toBase: 1 },
  kg: { dimension: "mass", toBase: 1000 },
  lb: { dimension: "mass", toBase: 453.592 },
  oz: { dimension: "mass", toBase: 28.3495 },
  // Volume (base: mL)
  mL: { dimension: "volume", toBase: 1 },
  L: { dimension: "volume", toBase: 1000 },
  fl_oz: { dimension: "volume", toBase: 29.5735 },
  cup: { dimension: "volume", toBase: 236.588 },
  tbsp: { dimension: "volume", toBase: 14.7868 },
  tsp: { dimension: "volume", toBase: 4.92892 },
  // Count (base: each)
  each: { dimension: "count", toBase: 1 },
  dozen: { dimension: "count", toBase: 12 },
};

export function dimensionOf(unit: string): Dimension | null {
  const def = UNIT_TABLE[unit];
  return def ? def.dimension : null;
}

/**
 * Convert `qty` from `from` to `to`. Returns null when either unit is unknown
 * (custom or unmapped) or when they're in different dimensions.
 */
export function convert(
  qty: number,
  from: string,
  to: string
): number | null {
  if (from === to) return qty;
  const fromDef = UNIT_TABLE[from];
  const toDef = UNIT_TABLE[to];
  if (!fromDef || !toDef) return null;
  if (fromDef.dimension !== toDef.dimension) return null;
  return (qty * fromDef.toBase) / toDef.toBase;
}

/**
 * Format a converted quantity for display: whole numbers render without
 * decimals; fractional values round to 2 decimals.
 */
export function formatConvertedQuantity(qty: number): string {
  if (!Number.isFinite(qty)) return String(qty);
  // Treat anything within 1e-9 of an integer as whole — guards against
  // float drift from chained conversions (e.g., 1 L * 1000 / 1).
  const rounded = Math.round(qty);
  if (Math.abs(qty - rounded) < 1e-9) return String(rounded);
  return qty.toFixed(2);
}

/**
 * Convenience: returns every unit string that shares a dimension with `unit`.
 * Used by the display-unit picker to filter compatible options.
 */
export function compatibleUnits(unit: string): string[] {
  const dim = dimensionOf(unit);
  if (!dim) return [];
  return Object.entries(UNIT_TABLE)
    .filter(([, def]) => def.dimension === dim)
    .map(([name]) => name);
}
