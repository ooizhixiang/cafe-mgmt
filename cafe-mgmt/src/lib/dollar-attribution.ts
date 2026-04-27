/**
 * Calculate dollar value for quantity changes.
 * Handles both percentage-based (with unitsPerContainer) and discrete units.
 */
export function calculateDollarValue(
  ingredient: {
    costPerUnitInCents: number | null;
    unitsPerContainer: number | null;
    unit: string;
  },
  quantityDelta: number
): number {
  if (!ingredient.costPerUnitInCents || quantityDelta === 0) return 0;

  // Percentage-based ingredients use unitsPerContainer for conversion
  if (ingredient.unit === "%" && ingredient.unitsPerContainer) {
    return Math.round(
      (Math.abs(quantityDelta) / 100) *
        ingredient.unitsPerContainer *
        ingredient.costPerUnitInCents
    );
  }

  // Discrete units: simple multiplication
  return Math.abs(quantityDelta) * ingredient.costPerUnitInCents;
}
