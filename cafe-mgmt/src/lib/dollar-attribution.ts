// Prisma Decimal has a .toNumber() method; accept either plain number or Decimal-like.
type DecimalLike = { toNumber: () => number };
type CostInput = number | string | DecimalLike | null;

function toCostNumber(value: CostInput): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return value.toNumber();
}

/**
 * Calculate dollar value for quantity changes.
 * Handles both percentage-based (with unitsPerContainer) and discrete units.
 */
export function calculateDollarValue(
  ingredient: {
    costPerUnitInCents: CostInput;
    unitsPerContainer: number | null;
    unit: string;
  },
  quantityDelta: number
): number {
  const cost = toCostNumber(ingredient.costPerUnitInCents);
  if (!cost || quantityDelta === 0) return 0;

  // Percentage-based ingredients use unitsPerContainer for conversion
  if (ingredient.unit === "%" && ingredient.unitsPerContainer) {
    return Math.round(
      (Math.abs(quantityDelta) / 100) *
        ingredient.unitsPerContainer *
        cost
    );
  }

  // Discrete units: simple multiplication
  return Math.round(Math.abs(quantityDelta) * cost);
}
