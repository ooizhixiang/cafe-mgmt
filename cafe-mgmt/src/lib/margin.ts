/**
 * Pure helpers for the recipe-margin alert. No Prisma dependency.
 *
 * Margin formula: `(selling - cost) / selling`. A 20% margin means cost is
 * 80% of selling. Margin can be negative (cost > selling = outright loss).
 */

/**
 * Compute the margin ratio. Returns null when selling is zero or negative
 * (undefined / un-priced — caller skips silently).
 */
export function computeMargin(
  sellingCents: number,
  costCents: number
): number | null {
  if (!Number.isFinite(sellingCents) || sellingCents <= 0) return null;
  if (!Number.isFinite(costCents)) return null;
  return (sellingCents - costCents) / sellingCents;
}

/**
 * Returns true when the margin falls strictly below the floor.
 * `floorPercent` is an integer 0..99 (e.g. 20 means "warn below 20% margin").
 * Margin null (un-priced) returns false — never below floor when undefined.
 */
export function isBelowFloor(
  margin: number | null,
  floorPercent: number
): boolean {
  if (margin === null) return false;
  return margin < floorPercent / 100;
}

/**
 * Resolve the effective selling price for a variation. Variation's own price
 * wins; otherwise fall back to the recipe-level price. Returns null when
 * neither is set (treats 0 as "not set" to keep parity with the editor's
 * `priceInCents ? ... : "Not set"` UI semantic).
 */
export function effectiveSellingPrice(
  variationSellingCents: number | null | undefined,
  recipeSellingCents: number | null | undefined
): number | null {
  if (variationSellingCents != null && variationSellingCents > 0) {
    return variationSellingCents;
  }
  if (recipeSellingCents != null && recipeSellingCents > 0) {
    return recipeSellingCents;
  }
  return null;
}
