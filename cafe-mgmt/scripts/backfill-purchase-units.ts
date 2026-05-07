/**
 * One-shot backfill: normalize historical IngredientPurchase rows so that
 * `purchase.quantity` / `remainingQuantity` are stored in the ingredient's
 * storage `unit`. Also bumps today's InventoryCount by the per-purchase delta
 * so totals remain consistent.
 *
 * Idempotent: re-running finds zero mismatches and reports "no changes
 * needed". Safe to run multiple times.
 *
 * Run: `npx tsx scripts/backfill-purchase-units.ts`
 *
 * Aborts with a clear error (no partial-fix) if any row's purchase unit
 * cannot be converted to its ingredient's storage unit.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { convert } from "../src/lib/unit-conversion";
import { getCafeToday } from "../src/lib/format";

// Legacy unit names known to mean the same thing as a canonical unit. The
// convert() table only knows the canonical names, so we normalize these
// before attempting conversion. Limited to what the spec authorizes.
const LEGACY_INGREDIENT_UNIT_RENAMES: Record<string, string> = {
  ml: "mL",
};
const LEGACY_PURCHASE_UNIT_RENAMES: Record<string, string> = {
  pcs: "each",
};

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  try {
    const today = getCafeToday();
    console.log(`Backfill start. KL today (UTC midnight): ${today.toISOString()}`);

    // Step 1: find Ingredient rows whose unit is a legacy lowercase variant
    // (`ml`) and rename to canonical (`mL`). Only the affected ingredients —
    // we don't touch unrelated unit names. Idempotent: if the rename already
    // happened, this loop reports zero matches and skips.
    const renameableIngredients = await prisma.ingredient.findMany({
      where: { unit: { in: Object.keys(LEGACY_INGREDIENT_UNIT_RENAMES) } },
      select: { id: true, name: true, unit: true },
    });
    let renamedIngredientCount = 0;
    for (const ing of renameableIngredients) {
      const nextUnit = LEGACY_INGREDIENT_UNIT_RENAMES[ing.unit];
      if (!nextUnit) continue;
      console.log(
        `  rename ingredient unit: ${ing.name} (${ing.id}) ${ing.unit} → ${nextUnit}`
      );
      await prisma.ingredient.update({
        where: { id: ing.id },
        data: { unit: nextUnit },
      });
      renamedIngredientCount += 1;
    }
    if (renamedIngredientCount === 0) {
      console.log("  no ingredient unit renames needed");
    }

    // Step 2: load every IngredientPurchase + its ingredient's storage unit
    // (post-rename). Identify mismatches.
    const purchases = await prisma.ingredientPurchase.findMany({
      include: {
        ingredientSupplier: {
          select: {
            ingredient: { select: { id: true, name: true, unit: true } },
          },
        },
      },
    });
    console.log(`Loaded ${purchases.length} purchase rows`);

    // Group purchases needing change so we can also pre-validate every
    // conversion before any write. All-or-nothing: if any row fails the
    // pre-check, abort with a clear message.
    type Plan = {
      purchaseId: string;
      ingredientId: string;
      ingredientName: string;
      originalQuantity: number;
      originalUnit: string;
      convertedQuantity: number;
      storageUnit: string;
      remainingDelta: number; // converted - originalQuantity
    };
    const plans: Plan[] = [];
    for (const p of purchases) {
      const ing = p.ingredientSupplier.ingredient;
      const storageUnit = ing.unit;

      // Apply legacy purchase unit rename inline (pcs → each).
      const renamedPurchaseUnit =
        LEGACY_PURCHASE_UNIT_RENAMES[p.unit] ?? p.unit;

      // Already in storage unit (after potential rename) → no change needed.
      if (renamedPurchaseUnit === storageUnit) {
        if (renamedPurchaseUnit === p.unit) continue; // truly nothing to do
        // pcs → each (1:1 rename only); quantity unchanged.
        plans.push({
          purchaseId: p.id,
          ingredientId: ing.id,
          ingredientName: ing.name,
          originalQuantity: p.quantity,
          originalUnit: p.unit,
          convertedQuantity: p.quantity,
          storageUnit,
          remainingDelta: 0,
        });
        continue;
      }

      const c = convert(p.quantity, renamedPurchaseUnit, storageUnit);
      if (c === null) {
        console.error(
          `ABORT: cannot convert purchase ${p.id} (${ing.name}, ingredient ${ing.id}): ${p.quantity} ${p.unit} → ${storageUnit}`
        );
        console.error(
          "  No rows have been changed beyond the ingredient unit renames above. Inspect the row and decide a manual fix."
        );
        process.exit(1);
      }
      // IngredientPurchase.quantity is `Int` — round defensively. All known
      // mismatches yield exact integers (kg→g, L→mL multiply by 1000), but a
      // stray fractional value would silently fail Prisma's Int type check.
      const convertedInt = Math.round(c);
      plans.push({
        purchaseId: p.id,
        ingredientId: ing.id,
        ingredientName: ing.name,
        originalQuantity: p.quantity,
        originalUnit: p.unit,
        convertedQuantity: convertedInt,
        storageUnit,
        remainingDelta: convertedInt - p.quantity,
      });
    }

    if (plans.length === 0) {
      console.log("\nNo purchase rows need backfilling — nothing changed.");
      return;
    }

    console.log(`\nPlanning ${plans.length} purchase row update(s):`);
    for (const plan of plans) {
      console.log(
        `  • ${plan.ingredientName} (${plan.purchaseId}): ${plan.originalQuantity} ${plan.originalUnit} → ${plan.convertedQuantity} ${plan.storageUnit}` +
          (plan.remainingDelta !== 0
            ? ` (Δ${plan.remainingDelta} for today's count)`
            : "")
      );
    }

    // Step 3: apply each row. Update the purchase row, then bump today's
    // InventoryCount by the delta (if non-zero). We don't wrap in a single
    // transaction — each row is independent; failures here would be unusual
    // (we pre-validated). For per-row atomicity we use a per-row $transaction.
    let countDeltaApplied = 0;
    const perIngredientDelta = new Map<string, number>();

    for (const plan of plans) {
      await prisma.$transaction(async (tx) => {
        // Re-read the row inside the txn to defend against concurrent edits.
        const current = await tx.ingredientPurchase.findUnique({
          where: { id: plan.purchaseId },
          select: { quantity: true, remainingQuantity: true, unit: true },
        });
        if (!current) {
          console.warn(
            `  skip ${plan.purchaseId}: row vanished between plan and apply`
          );
          return;
        }

        // Skip if a prior partial run (or another process) already converted
        // this row. Idempotency guard.
        if (current.unit === plan.storageUnit && current.quantity === plan.convertedQuantity) {
          return;
        }

        // Update purchase row to converted/storage values.
        await tx.ingredientPurchase.update({
          where: { id: plan.purchaseId },
          data: {
            quantity: plan.convertedQuantity,
            remainingQuantity:
              // Preserve any consumption that may have happened: scale the
              // remaining proportionally if current.quantity > 0, else use
              // converted directly.
              current.quantity > 0
                ? Math.round(
                    (current.remainingQuantity / current.quantity) *
                      plan.convertedQuantity
                  )
                : plan.convertedQuantity,
            unit: plan.storageUnit,
          },
        });

        if (plan.remainingDelta === 0) return;

        // Bump today's InventoryCount by the delta. Seed from latest prior
        // count when none exists today (matches the runtime purchase action).
        const prior = await tx.inventoryCount.findFirst({
          where: {
            ingredientId: plan.ingredientId,
            countDate: { lt: today },
          },
          orderBy: { countDate: "desc" },
          select: { quantity: true, cafeId: true, confirmedById: true },
        });

        const todayCount = await tx.inventoryCount.findUnique({
          where: {
            ingredientId_countDate: {
              ingredientId: plan.ingredientId,
              countDate: today,
            },
          },
          select: { id: true, quantity: true, cafeId: true, confirmedById: true },
        });

        if (todayCount) {
          await tx.inventoryCount.update({
            where: { id: todayCount.id },
            data: { quantity: todayCount.quantity + plan.remainingDelta },
          });
        } else {
          // No count today; we need a confirmedById and cafeId. Pull from the
          // prior count if available, else from the purchase row's cafe/creator.
          const purchaseMeta = await tx.ingredientPurchase.findUnique({
            where: { id: plan.purchaseId },
            select: { cafeId: true, createdById: true },
          });
          if (!purchaseMeta) return;
          const cafeId = prior?.cafeId ?? purchaseMeta.cafeId;
          const confirmedById = prior?.confirmedById ?? purchaseMeta.createdById;
          const baseQty = prior?.quantity ?? 0;
          await tx.inventoryCount.create({
            data: {
              ingredientId: plan.ingredientId,
              cafeId,
              countDate: today,
              quantity: baseQty + plan.remainingDelta,
              confirmedById,
              confirmedAt: new Date(),
            },
          });
        }
        countDeltaApplied += plan.remainingDelta;
        perIngredientDelta.set(
          plan.ingredientId,
          (perIngredientDelta.get(plan.ingredientId) ?? 0) + plan.remainingDelta
        );
      });
      console.log(`  ✓ updated purchase ${plan.purchaseId}`);
    }

    console.log(`\nSummary:`);
    console.log(`  ingredients renamed (legacy unit): ${renamedIngredientCount}`);
    console.log(`  purchase rows updated: ${plans.length}`);
    console.log(`  today's InventoryCount net delta: ${countDeltaApplied}`);
    if (perIngredientDelta.size > 0) {
      console.log(`  per-ingredient delta:`);
      for (const [ingredientId, delta] of perIngredientDelta) {
        console.log(`    - ${ingredientId}: +${delta}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("Backfill failed:", e);
  process.exit(1);
});
