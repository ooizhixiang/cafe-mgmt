/**
 * Pure helpers for FIFO lot accounting. No Prisma dependency.
 *
 * Spec B1 ships these helpers + tests. Spec B2 will wire `consumeFifo` and
 * `restoreFifo` into wastage / comp / sales deduction paths.
 */

export interface Lot {
  id: string;
  remaining: number; // remainingQuantity
  perUnitInCents: number; // totalPriceInCents / quantity, already as number
}

export interface ConsumePlan {
  lotsConsumed: Array<{
    lotId: string;
    qty: number;
    perUnitInCents: number;
    kind: "LOT";
  }>;
  overDeducted: {
    qty: number;
    perUnitInCents: number;
    kind: "OVER_DEDUCTION";
  } | null;
}

/**
 * Walk lots oldest-first, consuming `requested` quantity. Returns the plan.
 * Caller is responsible for actually decrementing `remaining` and writing
 * `LotConsumption` rows.
 *
 * If lots are insufficient, `overDeducted` records the deficit at the
 * most-recent lot's price (or 0 if no lots at all).
 */
export function consumeFifo(lots: Lot[], requested: number): ConsumePlan {
  if (!Number.isFinite(requested) || requested <= 0) {
    return { lotsConsumed: [], overDeducted: null };
  }
  const lotsConsumed: ConsumePlan["lotsConsumed"] = [];
  let remaining = requested;
  for (const lot of lots) {
    if (remaining <= 0) break;
    if (lot.remaining <= 0) continue;
    const take = Math.min(lot.remaining, remaining);
    lotsConsumed.push({
      lotId: lot.id,
      qty: take,
      perUnitInCents: lot.perUnitInCents,
      kind: "LOT",
    });
    remaining -= take;
  }
  if (remaining > 0) {
    // Use the most-recent (last) lot's price, or 0 if no lots at all.
    // Coerce non-finite (NaN/Infinity) prices to 0 so downstream math stays safe.
    const rawLastPrice = lots.length > 0 ? lots[lots.length - 1].perUnitInCents : 0;
    const lastPrice = Number.isFinite(rawLastPrice) ? rawLastPrice : 0;
    return {
      lotsConsumed,
      overDeducted: {
        qty: remaining,
        perUnitInCents: lastPrice,
        kind: "OVER_DEDUCTION",
      },
    };
  }
  return { lotsConsumed, overDeducted: null };
}

/**
 * Mirror of `consumeFifo` for restoration. Given consumption rows, returns
 * increments to apply back to lots. Synthetic over-deduction rows
 * (`ingredientPurchaseId = null`) are filtered out — they have no lot to refill.
 */
export interface ConsumptionRow {
  ingredientPurchaseId: string | null;
  quantityConsumed: number;
}

export function restoreFifo(
  rows: ConsumptionRow[]
): Array<{ lotId: string; refillQty: number }> {
  return rows
    .filter(
      (r): r is ConsumptionRow & { ingredientPurchaseId: string } =>
        r.ingredientPurchaseId !== null
    )
    .map((r) => ({ lotId: r.ingredientPurchaseId, refillQty: r.quantityConsumed }));
}

/**
 * Derived cost-per-unit for an ingredient.
 *
 * Precedence:
 *   1. override → ingredient.costPerUnitInCents
 *   2. oldest non-empty lot's per-unit price
 *   3. fallback to ingredient.costPerUnitInCents (initial seed)
 *   4. null if neither is available
 */
export interface IngredientForCost {
  manualCostOverride: boolean;
  costPerUnitInCents: number | null;
}

export interface OldestLot {
  totalPriceInCents: number;
  quantity: number; // total quantity from purchase, used to compute per-unit
}

export function currentCostPerUnit(
  ingredient: IngredientForCost,
  oldestLot: OldestLot | null
): number | null {
  if (ingredient.manualCostOverride) {
    return ingredient.costPerUnitInCents;
  }
  if (oldestLot && oldestLot.quantity > 0) {
    return oldestLot.totalPriceInCents / oldestLot.quantity;
  }
  return ingredient.costPerUnitInCents;
}

/**
 * Find the oldest non-empty lot for an ingredient. Tie-break on `id` ascending
 * to mirror `consumeFifo`'s `[createdAt asc, id asc]` ordering — display and
 * consumption must agree on which lot is "next".
 *
 * Accepts either Date or ISO-string `createdAt` so server (Prisma `Date`) and
 * client (serialized ISO string) call sites can converge on one helper.
 */
export interface PurchaseLotInput {
  id: string;
  createdAt: Date | string;
  remainingQuantity: number;
  totalPriceInCents: number;
  quantity: number;
}

export function findOldestNonEmptyLot(
  purchases: PurchaseLotInput[]
): OldestLot | null {
  let best: { id: string; createdAtMs: number; lot: OldestLot } | null = null;
  for (const p of purchases) {
    // "Non-empty" means both axes: usable stock AND a divisor for per-unit math.
    // Skipping `quantity <= 0` defends downstream callers that divide by it
    // (currentCostPerUnit guards too, but other consumers of OldestLot may not).
    if (p.remainingQuantity <= 0 || p.quantity <= 0) continue;
    const createdAtMs =
      p.createdAt instanceof Date
        ? p.createdAt.getTime()
        : new Date(p.createdAt).getTime();
    // Reject NaN-time inputs (invalid ISO strings). Without this, an invalid
    // first row would be set as `best` (since `best === null` short-circuits
    // the comparison), and every later valid row would lose to it because all
    // `NaN < x` comparisons are false — silently poisoning the result.
    if (!Number.isFinite(createdAtMs)) continue;
    const isOlder =
      best === null ||
      createdAtMs < best.createdAtMs ||
      (createdAtMs === best.createdAtMs && p.id < best.id);
    if (isOlder) {
      best = {
        id: p.id,
        createdAtMs,
        lot: { totalPriceInCents: p.totalPriceInCents, quantity: p.quantity },
      };
    }
  }
  return best?.lot ?? null;
}
