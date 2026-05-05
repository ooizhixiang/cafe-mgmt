/**
 * DB-bound wrappers around the pure FIFO helpers in `./fifo.ts`.
 *
 * `applyConsumeFifo` reads oldest-first lots, runs `consumeFifo`, and persists
 * `LotConsumption` rows + `IngredientPurchase.remainingQuantity` decrements
 * inside the caller-provided transaction.
 *
 * `applyRestoreFifo` reverses a prior consumption: refills lot quantities for
 * `LOT`-kind rows and deletes every row for the source. `OVER_DEDUCTION` rows
 * have no lot to refill — they are simply deleted.
 *
 * `getAvailableQty` is the pre-flight used by wastage/comp to surface the
 * over-deduction confirmation dialog.
 */
import type { Prisma } from "@/generated/prisma/client";
import type { ConsumePlan } from "./fifo";
import { consumeFifo } from "./fifo";

type Tx = Prisma.TransactionClient;

export type LotSourceType = "WASTAGE" | "COMP" | "SALES";

/**
 * Thrown by `applyConsumeFifo` when a conditional lot decrement matches zero
 * rows (a concurrent transaction drained the lot first). Callers should catch
 * this and surface a retry-friendly error to the user.
 */
export const LOT_RACE = "LOT_RACE";

export interface ApplyConsumeResult {
  totalCostInCents: number;
  lotsConsumed: ConsumePlan["lotsConsumed"];
  overDeducted: ConsumePlan["overDeducted"];
  totalConsumedQty: number;
}

export async function applyConsumeFifo(
  tx: Tx,
  args: {
    cafeId: string;
    ingredientId: string;
    requested: number;
    sourceType: LotSourceType;
    sourceId: string;
  }
): Promise<ApplyConsumeResult> {
  const lotsRaw = await tx.ingredientPurchase.findMany({
    where: {
      cafeId: args.cafeId,
      ingredientSupplier: { ingredientId: args.ingredientId },
      remainingQuantity: { gt: 0 },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      remainingQuantity: true,
      quantity: true,
      totalPriceInCents: true,
    },
  });

  const lots = lotsRaw.map((l) => ({
    id: l.id,
    remaining: l.remainingQuantity,
    perUnitInCents:
      l.quantity > 0 ? Number(l.totalPriceInCents) / l.quantity : 0,
  }));

  const plan = consumeFifo(lots, args.requested);

  for (const lc of plan.lotsConsumed) {
    // Conditional decrement guards against TOCTOU under read-committed:
    // if a concurrent transaction has already drained this lot below `lc.qty`,
    // `updateMany` matches zero rows and we abort the surrounding transaction.
    const updated = await tx.ingredientPurchase.updateMany({
      where: { id: lc.lotId, remainingQuantity: { gte: lc.qty } },
      data: { remainingQuantity: { decrement: lc.qty } },
    });
    if (updated.count === 0) {
      throw new Error(LOT_RACE);
    }
    await tx.lotConsumption.create({
      data: {
        cafeId: args.cafeId,
        sourceType: args.sourceType,
        sourceId: args.sourceId,
        ingredientPurchaseId: lc.lotId,
        quantityConsumed: lc.qty,
        perUnitInCents: lc.perUnitInCents,
        consumptionKind: "LOT",
      },
    });
  }

  if (plan.overDeducted) {
    await tx.lotConsumption.create({
      data: {
        cafeId: args.cafeId,
        sourceType: args.sourceType,
        sourceId: args.sourceId,
        ingredientPurchaseId: null,
        quantityConsumed: plan.overDeducted.qty,
        perUnitInCents: plan.overDeducted.perUnitInCents,
        consumptionKind: "OVER_DEDUCTION",
      },
    });
  }

  const totalCostInCents =
    plan.lotsConsumed.reduce((s, r) => s + r.qty * r.perUnitInCents, 0) +
    (plan.overDeducted
      ? plan.overDeducted.qty * plan.overDeducted.perUnitInCents
      : 0);
  const totalConsumedQty =
    plan.lotsConsumed.reduce((s, r) => s + r.qty, 0) +
    (plan.overDeducted ? plan.overDeducted.qty : 0);

  return {
    totalCostInCents,
    lotsConsumed: plan.lotsConsumed,
    overDeducted: plan.overDeducted,
    totalConsumedQty,
  };
}

export async function applyRestoreFifo(
  tx: Tx,
  args: { sourceType: LotSourceType; sourceId: string }
): Promise<void> {
  const rows = await tx.lotConsumption.findMany({
    where: { sourceType: args.sourceType, sourceId: args.sourceId },
    select: {
      id: true,
      ingredientPurchaseId: true,
      quantityConsumed: true,
      consumptionKind: true,
    },
  });

  for (const row of rows) {
    if (row.consumptionKind === "LOT" && row.ingredientPurchaseId) {
      await tx.ingredientPurchase.update({
        where: { id: row.ingredientPurchaseId },
        data: { remainingQuantity: { increment: row.quantityConsumed } },
      });
    }
  }

  await tx.lotConsumption.deleteMany({
    where: { sourceType: args.sourceType, sourceId: args.sourceId },
  });
}

/**
 * Pre-flight that returns total `remainingQuantity` across active lots.
 *
 * MUST be called inside a `prisma.$transaction(...)` block, passing the
 * transaction client `tx`. Calling against the global Prisma client before a
 * subsequent transaction creates a TOCTOU window: the value could be stale by
 * the time the consume runs, leading to bogus over-deduction prompts (or
 * silently skipped prompts).
 */
export async function getAvailableQty(
  tx: Tx,
  ingredientId: string,
  cafeId: string
): Promise<number> {
  const result = await tx.ingredientPurchase.aggregate({
    where: {
      cafeId,
      ingredientSupplier: { ingredientId },
      remainingQuantity: { gt: 0 },
    },
    _sum: { remainingQuantity: true },
  });
  return result._sum.remainingQuantity ?? 0;
}

/**
 * Returns `true` if the ingredient has *any* purchase history (regardless of
 * remainingQuantity). Used by wastage/comp to distinguish "stock exhausted"
 * (lots exist but drained → over-deduction at last lot's price is meaningful)
 * from "no purchases ever recorded" (no lots at all → over-deduction at $0
 * silently loses cost data; we should block instead).
 */
export async function hasAnyLot(
  tx: Tx,
  ingredientId: string,
  cafeId: string
): Promise<boolean> {
  const count = await tx.ingredientPurchase.count({
    where: {
      cafeId,
      ingredientSupplier: { ingredientId },
    },
  });
  return count > 0;
}

/**
 * Wire format for over-deduction errors returned through `ActionResult.error`.
 * Clients pattern-match on the `OVER_DEDUCTION:` prefix.
 */
export const OVER_DEDUCTION_PREFIX = "OVER_DEDUCTION:";

export interface OverDeductionPayload {
  availableQty: number;
  requestedQty: number;
}

export function encodeOverDeductionError(
  payload: OverDeductionPayload
): string {
  return OVER_DEDUCTION_PREFIX + JSON.stringify(payload);
}

export function parseOverDeductionError(
  error: string
): OverDeductionPayload | null {
  if (!error.startsWith(OVER_DEDUCTION_PREFIX)) return null;
  try {
    const json = error.slice(OVER_DEDUCTION_PREFIX.length);
    const parsed = JSON.parse(json) as Partial<OverDeductionPayload>;
    if (
      typeof parsed.availableQty === "number" &&
      typeof parsed.requestedQty === "number"
    ) {
      return {
        availableQty: parsed.availableQty,
        requestedQty: parsed.requestedQty,
      };
    }
    return null;
  } catch {
    return null;
  }
}
