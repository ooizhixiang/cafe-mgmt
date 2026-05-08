"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { getCafeToday } from "@/lib/format";
import { calculateDollarValue } from "@/lib/dollar-attribution";
import { checkThresholds } from "@/lib/threshold-check";
import { logError } from "@/lib/log-error";
import {
  groupPurchasesIntoReceipts,
  parseBatchKey,
  type Receipt,
} from "@/lib/purchase-batch";
import { convert, dimensionOf } from "@/lib/unit-conversion";
import type { ActionResult } from "@/types";

// ─── Schemas ────────────────────────────────────────────────

const updateIngredientConfigSchema = z.object({
  id: z.string().min(1),
  costPerUnitInCents: z.number().min(0).nullable().optional(),
  snapIncrement: z.number().int().min(1).nullable().optional(),
  containerProfile: z.string().max(100).nullable().optional(),
  category: z.string().max(50).nullable().optional(),
  lowStockThreshold: z.number().int().min(0).nullable().optional(),
  unitsPerContainer: z.number().int().min(1).nullable().optional(),
  isPinned: z.boolean().optional(),
});

const createIngredientPurchaseSchema = z.object({
  ingredientSupplierId: z.string().min(1),
  quantity: z.number().int().min(1),
  unit: z.string().min(1).max(20),
  totalPriceInCents: z.number().min(0),
});

const bulkCreateIngredientPurchasesSchema = z.object({
  supplierId: z.string().min(1),
  lines: z
    .array(
      z.object({
        ingredientId: z.string().min(1),
        ingredientSupplierId: z.string().min(1),
        quantity: z.number().int().min(1),
        unit: z.string().min(1).max(20),
        totalPriceInCents: z.number().min(0),
      })
    )
    .min(1),
});

const saveCountSchema = z.object({
  ingredientId: z.string().min(1),
  quantity: z.number().int().min(0),
  expectedUpdatedAt: z.string().optional(),
});

const bulkConfirmSchema = z.object({
  ingredientIds: z.array(z.string().min(1)).min(1),
});

const setManualCostOverrideSchema = z.object({
  ingredientId: z.string().min(1),
  override: z.boolean(),
  value: z.number().min(0).max(99_999_999_9999).nullable().optional(),
});

// ─── Ingredient Configuration (Story 3.1) ──────────────────

export async function updateIngredientConfig(
  input: z.infer<typeof updateIngredientConfigSchema>
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;
    const parsed = updateIngredientConfigSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const { id, ...data } = parsed.data;

    // Verify ingredient belongs to this cafe
    const ingredient = await prisma.ingredient.findFirst({
      where: { id, cafeId },
    });
    if (!ingredient) {
      return { success: false, error: "Ingredient not found" };
    }

    await prisma.ingredient.update({
      where: { id },
      data,
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to update ingredient" };
  }
}

export async function togglePin(
  ingredientId: string
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;

    const ingredient = await prisma.ingredient.findFirst({
      where: { id: ingredientId, cafeId },
    });
    if (!ingredient) {
      return { success: false, error: "Ingredient not found" };
    }

    await prisma.ingredient.update({
      where: { id: ingredientId },
      data: { isPinned: !ingredient.isPinned },
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to toggle pin" };
  }
}

// ─── Inventory Counting (Story 3.2 & 3.3) ──────────────────

export async function getInventoryCounts(): Promise<
  ActionResult<{
    ingredients: Array<{
      id: string;
      name: string;
      unit: string;
      category: string | null;
      isPinned: boolean;
      snapIncrement: number | null;
      containerProfile: string | null;
      costPerUnitInCents: number | null;
      unitsPerContainer: number | null;
      lowStockThreshold: number | null;
      todayCount: number | null;
      todayUpdatedAt: string | null;
      previousCount: number | null;
    }>;
  }>
> {
  try {
    const session = await requireAuth();
    const cafeId = session.user.cafeId;

    const today = getCafeToday();

    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    const ingredients = await prisma.ingredient.findMany({
      where: { cafeId },
      orderBy: [{ isPinned: "desc" }, { displayOrder: "asc" }],
      include: {
        inventoryCounts: {
          where: {
            countDate: { in: [today, yesterday] },
          },
          orderBy: { countDate: "desc" },
        },
      },
    });

    const mapped = ingredients.map((ing) => {
      const todayEntry = ing.inventoryCounts.find(
        (c) => c.countDate.toISOString().slice(0, 10) === today.toISOString().slice(0, 10)
      );
      const yesterdayEntry = ing.inventoryCounts.find(
        (c) => c.countDate.toISOString().slice(0, 10) === yesterday.toISOString().slice(0, 10)
      );

      return {
        id: ing.id,
        name: ing.name,
        unit: ing.unit,
        category: ing.category,
        isPinned: ing.isPinned,
        snapIncrement: ing.snapIncrement,
        containerProfile: ing.containerProfile,
        costPerUnitInCents:
          ing.costPerUnitInCents === null ? null : ing.costPerUnitInCents.toNumber(),
        unitsPerContainer: ing.unitsPerContainer,
        lowStockThreshold: ing.lowStockThreshold,
        todayCount: todayEntry?.quantity ?? null,
        todayUpdatedAt: todayEntry?.updatedAt.toISOString() ?? null,
        previousCount: yesterdayEntry?.quantity ?? null,
      };
    });

    return { success: true, data: { ingredients: mapped } };
  } catch {
    return { success: false, error: "Failed to load inventory" };
  }
}

export async function saveInventoryCount(
  input: z.infer<typeof saveCountSchema>
): Promise<
  ActionResult<{
    stale?: boolean;
    currentValue?: number;
    currentUpdatedAt?: string;
    dollarValueInCents?: number;
    previousQty?: number;
    newQty?: number;
  }>
> {
  try {
    const session = await requireAuth();
    const cafeId = session.user.cafeId;
    const parsed = saveCountSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const { ingredientId, quantity, expectedUpdatedAt } = parsed.data;

    // Verify ingredient belongs to cafe
    const ingredient = await prisma.ingredient.findFirst({
      where: { id: ingredientId, cafeId },
    });
    if (!ingredient) {
      return { success: false, error: "Ingredient not found" };
    }

    const today = getCafeToday();

    // Check for optimistic concurrency conflict
    const existing = await prisma.inventoryCount.findUnique({
      where: {
        ingredientId_countDate: { ingredientId, countDate: today },
      },
    });

    if (existing && expectedUpdatedAt) {
      const expectedTime = new Date(expectedUpdatedAt).getTime();
      const actualTime = existing.updatedAt.getTime();
      if (Math.abs(actualTime - expectedTime) > 1000) {
        return {
          success: true,
          data: {
            stale: true,
            currentValue: existing.quantity,
            currentUpdatedAt: existing.updatedAt.toISOString(),
          },
        };
      }
    }

    const previousQty = existing?.quantity ?? null;
    const delta = previousQty !== null ? quantity - previousQty : 0;
    const dollarValueInCents = calculateDollarValue(ingredient, delta);

    await prisma.inventoryCount.upsert({
      where: {
        ingredientId_countDate: { ingredientId, countDate: today },
      },
      create: {
        ingredientId,
        cafeId,
        countDate: today,
        quantity,
        dollarValueInCents,
        confirmedById: session.user.id,
        confirmedAt: new Date(),
      },
      update: {
        quantity,
        dollarValueInCents,
        confirmedById: session.user.id,
        confirmedAt: new Date(),
      },
    });

    // Check thresholds after save
    await checkThresholds(cafeId, ingredientId);

    return {
      success: true,
      data: {
        previousQty: previousQty ?? undefined,
        newQty: quantity,
        dollarValueInCents,
      },
    };
  } catch {
    return { success: false, error: "Failed to save count" };
  }
}

export async function bulkConfirmUnchanged(
  input: z.infer<typeof bulkConfirmSchema>
): Promise<ActionResult<{ confirmed: number }>> {
  try {
    const session = await requireAuth();
    const cafeId = session.user.cafeId;
    const parsed = bulkConfirmSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Invalid input" };
    }

    const today = getCafeToday();

    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    let confirmed = 0;

    for (const ingredientId of parsed.data.ingredientIds) {
      const ingredient = await prisma.ingredient.findFirst({
        where: { id: ingredientId, cafeId },
      });
      if (!ingredient) continue;

      // Get yesterday's count
      const prevCount = await prisma.inventoryCount.findUnique({
        where: {
          ingredientId_countDate: { ingredientId, countDate: yesterday },
        },
      });

      if (!prevCount) continue;

      await prisma.inventoryCount.upsert({
        where: {
          ingredientId_countDate: { ingredientId, countDate: today },
        },
        create: {
          ingredientId,
          cafeId,
          countDate: today,
          quantity: prevCount.quantity,
          dollarValueInCents: 0,
          confirmedById: session.user.id,
          confirmedAt: new Date(),
        },
        update: {
          quantity: prevCount.quantity,
          dollarValueInCents: 0,
          confirmedById: session.user.id,
          confirmedAt: new Date(),
        },
      });

      confirmed++;
    }

    return { success: true, data: { confirmed } };
  } catch {
    return { success: false, error: "Failed to confirm unchanged" };
  }
}

export async function getRecipesForIngredient(
  ingredientId: string
): Promise<ActionResult<Array<{ id: string; name: string; quantityPerServing: number; variationName: string | null }>>> {
  try {
    const session = await requireAuth();
    const cafeId = session.user.cafeId;

    // Base recipe ingredients
    const recipeIngs = await prisma.recipeIngredient.findMany({
      where: { ingredientId, recipe: { cafeId } },
      include: { recipe: { select: { id: true, name: true } } },
    });

    // Variation ingredients
    const varIngs = await prisma.variationIngredient.findMany({
      where: { ingredientId, variation: { recipe: { cafeId } } },
      include: { variation: { include: { recipe: { select: { id: true, name: true } } } } },
    });

    const results = [
      ...recipeIngs.map((ri) => ({
        id: ri.recipe.id,
        name: ri.recipe.name,
        quantityPerServing: ri.quantityPerServing,
        variationName: null as string | null,
      })),
      ...varIngs.map((vi) => ({
        id: vi.variation.recipe.id,
        name: vi.variation.recipe.name,
        quantityPerServing: vi.quantityPerServing,
        variationName: vi.variation.name,
      })),
    ];

    return { success: true, data: results };
  } catch {
    return { success: false, error: "Failed to load recipes" };
  }
}

// ─── Ingredient Purchases ──────────────────────────────────

export async function createIngredientPurchase(
  input: z.infer<typeof createIngredientPurchaseSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireAuth();
    const cafeId = session.user.cafeId;
    const userId = session.user.id;
    const parsed = createIngredientPurchaseSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const link = await prisma.ingredientSupplier.findFirst({
      where: { id: parsed.data.ingredientSupplierId, cafeId },
      include: { ingredient: { select: { unit: true } } },
    });
    if (!link) {
      return { success: false, error: "Ingredient supplier not found" };
    }

    // Convert the user-entered purchase quantity into the ingredient's storage
    // unit before save. Storing in the storage unit keeps FIFO consume math
    // consistent (it operates on raw quantity/remainingQuantity with no unit
    // awareness). Reject the whole txn if convert() returns null
    // (cross-dimension or unknown unit).
    const storageUnit = link.ingredient.unit;
    const convertedRaw = convert(parsed.data.quantity, parsed.data.unit, storageUnit);
    if (convertedRaw === null) {
      throw new Error(
        `__CONVERT_FAIL__:Cannot convert ${parsed.data.quantity}${parsed.data.unit} to ${storageUnit}`
      );
    }
    // Round to integer — IngredientPurchase.quantity / InventoryCount.quantity
    // are `Int` columns. convert() can return fractional values for some unit
    // pairs (e.g. 1 lb → 453.592 g) and float arithmetic on otherwise-clean
    // pairs can also produce sub-unit residue.
    const converted = Math.round(convertedRaw);

    const today = getCafeToday();

    const purchase = await prisma.$transaction(async (tx) => {
      const created = await tx.ingredientPurchase.create({
        data: {
          ingredientSupplierId: parsed.data.ingredientSupplierId,
          cafeId,
          quantity: converted,
          remainingQuantity: converted,
          unit: storageUnit,
          totalPriceInCents: parsed.data.totalPriceInCents,
          createdById: userId,
        },
      });

      const prior = await tx.inventoryCount.findFirst({
        where: {
          ingredientId: link.ingredientId,
          cafeId,
          countDate: { lt: today },
        },
        orderBy: { countDate: "desc" },
        select: { quantity: true },
      });
      const baseQty = prior?.quantity ?? 0;

      await tx.inventoryCount.upsert({
        where: {
          ingredientId_countDate: {
            ingredientId: link.ingredientId,
            countDate: today,
          },
        },
        create: {
          ingredientId: link.ingredientId,
          cafeId,
          countDate: today,
          quantity: baseQty + converted,
          confirmedById: userId,
          confirmedAt: new Date(),
        },
        update: {
          quantity: { increment: converted },
        },
      });

      return created;
    });

    return { success: true, data: { id: purchase.id } };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    if (e instanceof Error && e.message.startsWith("__CONVERT_FAIL__:")) {
      return { success: false, error: e.message.slice("__CONVERT_FAIL__:".length) };
    }
    return { success: false, error: "Failed to log purchase" };
  }
}

export async function bulkCreateIngredientPurchases(
  input: z.infer<typeof bulkCreateIngredientPurchasesSchema>
): Promise<ActionResult<{ ids: string[] }>> {
  try {
    const session = await requireAuth();
    const cafeId = session.user.cafeId;
    const userId = session.user.id;

    const parsed = bulkCreateIngredientPurchasesSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }

    const { supplierId, lines } = parsed.data;

    // Reject duplicate ingredientId across lines
    const seen = new Set<string>();
    for (const line of lines) {
      if (seen.has(line.ingredientId)) {
        return {
          success: false,
          error: "Duplicate ingredient lines — combine the lines",
        };
      }
      seen.add(line.ingredientId);
    }

    // Verify supplier belongs to this cafe
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, cafeId },
      select: { id: true },
    });
    if (!supplier) {
      return { success: false, error: "Supplier not found" };
    }

    // Resolve "today" (date-only, KL wall clock) for the InventoryCount upsert.
    // Done outside the transaction since clock reads don't need to be
    // transactional and matches the existing convention elsewhere in this file.
    const today = getCafeToday();

    const ingredientIds = lines.map((l) => l.ingredientId);

    // Pre-fetch storage units for all ingredients so we can pre-validate every
    // line's conversion BEFORE opening the transaction. All-or-nothing: if any
    // line fails conversion, the whole bulk action is rejected and zero rows
    // are written. This avoids partial-DB-state on any conversion failure.
    const ingredientUnits = await prisma.ingredient.findMany({
      where: { id: { in: ingredientIds }, cafeId },
      select: { id: true, unit: true },
    });
    const unitByIngredient = new Map(ingredientUnits.map((i) => [i.id, i.unit]));

    const convertedByLine: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const storageUnit = unitByIngredient.get(line.ingredientId);
      if (!storageUnit) {
        // Fail-fast: an ingredient absent from the pre-fetch is either
        // cross-cafe or deleted. Don't fall back to raw values — the
        // invariant is that stored unit == storage unit.
        return {
          success: false,
          error: `Line ${i + 1}: ingredient ${line.ingredientId} not found in this cafe`,
        };
      }
      const c = convert(line.quantity, line.unit, storageUnit);
      if (c === null) {
        return {
          success: false,
          error: `Line ${i + 1} (ingredientId ${line.ingredientId}): cannot convert ${line.quantity}${line.unit} to ${storageUnit}`,
        };
      }
      // Round — Prisma `Int` columns reject fractional values that can come
      // out of unit conversion (e.g. 1 lb → 453.592 g).
      convertedByLine.push(Math.round(c));
    }

    const ids = await prisma.$transaction(async (tx) => {
      // Pre-load ingredients (cafe-scoped) — reject if any belongs to another cafe
      const ingredients = await tx.ingredient.findMany({
        where: { id: { in: ingredientIds }, cafeId },
        select: { id: true, name: true },
      });
      const foundIngredients = new Map(ingredients.map((i) => [i.id, i]));
      for (const line of lines) {
        if (!foundIngredients.has(line.ingredientId)) {
          throw new Error("Ingredient not found");
        }
      }

      // Pre-load existing IngredientSupplier rows for this supplier+cafe
      const existingLinks = await tx.ingredientSupplier.findMany({
        where: {
          supplierId,
          cafeId,
          ingredientId: { in: ingredientIds },
        },
      });
      const linkByIngredient = new Map(
        existingLinks.map((l) => [l.ingredientId, l])
      );

      const purchaseIds: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const existing = linkByIngredient.get(line.ingredientId);
        if (!existing || existing.id !== line.ingredientSupplierId) {
          throw new Error("Ingredient supplier link not found");
        }

        // Use the pre-converted quantity + the ingredient's storage unit so
        // the row matches what the FIFO consumer expects. Pre-validation above
        // already fail-fasts when the ingredient is missing from the cafe,
        // so the lookup is guaranteed to succeed here — the non-null
        // assertion is documenting that invariant, not papering over it.
        const converted = convertedByLine[i]!;
        const storageUnit = unitByIngredient.get(line.ingredientId)!;

        const purchase = await tx.ingredientPurchase.create({
          data: {
            ingredientSupplierId: existing.id,
            cafeId,
            quantity: converted,
            remainingQuantity: converted,
            unit: storageUnit,
            totalPriceInCents: line.totalPriceInCents,
            createdById: userId,
          },
        });
        purchaseIds.push(purchase.id);

        // Auto-bump today's InventoryCount inside the same transaction. Seed
        // from yesterday's (or latest prior) count when none exists today.
        const prior = await tx.inventoryCount.findFirst({
          where: {
            ingredientId: line.ingredientId,
            cafeId,
            countDate: { lt: today },
          },
          orderBy: { countDate: "desc" },
          select: { quantity: true },
        });
        const baseQty = prior?.quantity ?? 0;

        await tx.inventoryCount.upsert({
          where: {
            ingredientId_countDate: {
              ingredientId: line.ingredientId,
              countDate: today,
            },
          },
          create: {
            ingredientId: line.ingredientId,
            cafeId,
            countDate: today,
            quantity: baseQty + converted,
            confirmedById: userId,
            confirmedAt: new Date(),
          },
          update: {
            quantity: { increment: converted },
          },
        });
      }

      return purchaseIds;
    });

    return { success: true, data: { ids } };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    if (e instanceof Error) {
      // Surface friendly errors thrown during the transaction
      if (
        e.message === "Ingredient not found" ||
        e.message === "Ingredient supplier link not found"
      ) {
        return { success: false, error: e.message };
      }
    }
    const message = e instanceof Error ? e.message : "Failed to log purchases";
    await logError({ context: "bulkCreateIngredientPurchases", message });
    return { success: false, error: "Failed to log purchases" };
  }
}

// ─── Manual Cost Override (Spec B1: FIFO groundwork) ───────

export async function setManualCostOverride(
  ingredientId: string,
  override: boolean,
  value?: number | null,
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;

    const parsed = setManualCostOverrideSchema.safeParse({
      ingredientId,
      override,
      value,
    });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    // Reject the contradictory case: caller passing a numeric cost while
    // unlocking. Clearing during unlock (value === null) would be ambiguous
    // too — only `undefined` (no cost intent) is valid when unlocking.
    if (override === false && value !== undefined && value !== null) {
      return { success: false, error: "Cannot set cost while unlocking" };
    }

    const ingredient = await prisma.ingredient.findFirst({
      where: { id: ingredientId, cafeId },
      select: { id: true },
    });
    if (!ingredient) {
      return { success: false, error: "Ingredient not found" };
    }

    const data: {
      manualCostOverride: boolean;
      costPerUnitInCents?: number | null;
    } = {
      manualCostOverride: override,
    };
    // When locking: write cost when caller intends to (value !== undefined).
    // `value === null` is meaningful: clear the cost atomically with the lock.
    if (override === true && value !== undefined) {
      data.costPerUnitInCents = value;
    }

    await prisma.ingredient.update({
      where: { id: ingredientId },
      data,
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to update override" };
  }
}

// ─── Purchase History & Invoice Attach ─────────────────────

const HISTORY_DAYS = 90;
const HISTORY_PAGE_SIZE = 25;

const getPurchaseHistorySchema = z.object({
  page: z.number().int().min(0).optional(),
});

// Hard cap: ~3 MB base64 string. Compressed JPEG at 800px / q=0.7 lands at
// ~50–80 KB for typical receipts; this leaves a safety margin for unusually
// dense images while preventing accidental column-bloat from raw uploads.
const MAX_INVOICE_DATA_URL_LEN = 3_000_000;
const INVOICE_DATA_URL_PREFIX = /^data:image\/(jpeg|png|webp);base64,/;

const attachPurchaseInvoiceSchema = z.object({
  batchKey: z.string().min(1).max(500),
  imageDataUrl: z
    .string()
    .min(1)
    .max(MAX_INVOICE_DATA_URL_LEN)
    .regex(INVOICE_DATA_URL_PREFIX, "Invalid image format"),
});

const detachPurchaseInvoiceSchema = z.object({
  batchKey: z.string().min(1).max(500),
});

export async function getPurchaseHistory(
  input: z.infer<typeof getPurchaseHistorySchema> = {}
): Promise<
  ActionResult<{
    receipts: Receipt[];
    page: number;
    totalReceipts: number;
    pageSize: number;
  }>
> {
  try {
    const session = await requireAuth();
    const cafeId = session.user.cafeId;
    const parsed = getPurchaseHistorySchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Invalid input" };
    }
    const requestedPage = parsed.data.page ?? 0;

    const cutoff = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000);
    const rows = await prisma.ingredientPurchase.findMany({
      where: { cafeId, createdAt: { gte: cutoff } },
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { name: true } },
        ingredientSupplier: {
          select: {
            supplierId: true,
            supplier: { select: { name: true } },
            ingredient: { select: { id: true, name: true } },
          },
        },
      },
    });

    const allReceipts = groupPurchasesIntoReceipts(
      rows.map((r) => ({
        id: r.id,
        cafeId: r.cafeId,
        quantity: r.quantity,
        unit: r.unit,
        totalPriceInCents: r.totalPriceInCents.toNumber(),
        invoiceImageUrl: r.invoiceImageUrl,
        createdById: r.createdById,
        createdAt: r.createdAt,
        createdBy: r.createdBy,
        ingredientSupplier: r.ingredientSupplier,
      }))
    );

    const totalReceipts = allReceipts.length;
    const lastPage = Math.max(0, Math.ceil(totalReceipts / HISTORY_PAGE_SIZE) - 1);
    const page = Math.min(requestedPage, lastPage);
    const start = page * HISTORY_PAGE_SIZE;
    const receipts = allReceipts.slice(start, start + HISTORY_PAGE_SIZE);

    return {
      success: true,
      data: { receipts, page, totalReceipts, pageSize: HISTORY_PAGE_SIZE },
    };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to load purchase history" };
  }
}

async function writeInvoiceForBatch(
  batchKey: string,
  imageDataUrl: string | null,
  cafeId: string
): Promise<ActionResult<{ updatedCount: number }>> {
  const parsed = parseBatchKey(batchKey);
  if (!parsed) {
    return { success: false, error: "Invalid receipt reference" };
  }

  const result = await prisma.ingredientPurchase.updateMany({
    where: {
      cafeId,
      createdById: parsed.createdById,
      createdAt: { gte: parsed.minuteStart, lt: parsed.minuteEnd },
      ingredientSupplier: { supplierId: parsed.supplierId },
    },
    data: { invoiceImageUrl: imageDataUrl },
  });

  if (result.count === 0) {
    return { success: false, error: "Receipt not found" };
  }
  return { success: true, data: { updatedCount: result.count } };
}

export async function attachPurchaseInvoice(
  input: z.infer<typeof attachPurchaseInvoiceSchema>
): Promise<ActionResult<{ updatedCount: number }>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;
    const parsed = attachPurchaseInvoiceSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }
    return await writeInvoiceForBatch(
      parsed.data.batchKey,
      parsed.data.imageDataUrl,
      cafeId
    );
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    const message = e instanceof Error ? e.message : "Failed to attach invoice";
    await logError({ context: "attachPurchaseInvoice", message });
    return { success: false, error: "Failed to attach invoice" };
  }
}

export async function detachPurchaseInvoice(
  input: z.infer<typeof detachPurchaseInvoiceSchema>
): Promise<ActionResult<{ updatedCount: number }>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;
    const parsed = detachPurchaseInvoiceSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Invalid input" };
    }
    return await writeInvoiceForBatch(parsed.data.batchKey, null, cafeId);
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    const message = e instanceof Error ? e.message : "Failed to detach invoice";
    await logError({ context: "detachPurchaseInvoice", message });
    return { success: false, error: "Failed to detach invoice" };
  }
}

// ─── Inventory Log (Dashboard right column) ────────────────

const getInventoryLogSchema = z.object({
  cursor: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export type InventoryLogEntry = {
  kind: "loss" | "add";
  id: string;
  ingredientName: string;
  ingredientUnit: string;
  quantity: number;
  dollarValueInCents: number;
  createdAt: string;
  /**
   * Short description of WHY the entry exists, surfaced in the dashboard log.
   * - Loss (wastage): formatted `WastageReason` (e.g. "Spilled").
   * - Add (purchase): the supplier name (e.g. "Acme").
   * Empty string when the source row is missing the underlying field.
   */
  description: string;
};

const WASTAGE_REASON_LABEL: Record<string, string> = {
  SPILLED: "Spilled",
  EXPIRED: "Expired",
  INCORRECT: "Incorrect",
};

export async function getInventoryLog(
  input: z.infer<typeof getInventoryLogSchema> = {}
): Promise<
  ActionResult<{ entries: InventoryLogEntry[]; nextCursor: number | null }>
> {
  try {
    const session = await requireAuth();
    const cafeId = session.user.cafeId;
    const parsed = getInventoryLogSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Invalid input" };
    }
    const cursor = parsed.data.cursor ?? 0;
    const limit = parsed.data.limit ?? 30;
    const take = cursor + limit + 1;

    const [wastageRows, purchaseRows] = await Promise.all([
      prisma.wastageEntry.findMany({
        where: { cafeId, voidedAt: null, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take,
        include: { ingredient: { select: { name: true, unit: true } } },
      }),
      prisma.ingredientPurchase.findMany({
        where: { cafeId },
        orderBy: { createdAt: "desc" },
        take,
        include: {
          ingredientSupplier: {
            select: {
              ingredient: { select: { name: true, unit: true } },
              supplier: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    const wastageEntries: InventoryLogEntry[] = wastageRows.map((w) => ({
      kind: "loss",
      id: `wastage:${w.id}`,
      ingredientName: w.ingredient.name,
      ingredientUnit: w.ingredient.unit,
      quantity: w.quantity,
      dollarValueInCents: w.dollarValueInCents,
      createdAt: w.createdAt.toISOString(),
      description: WASTAGE_REASON_LABEL[w.reason] ?? String(w.reason),
    }));

    const purchaseEntries: InventoryLogEntry[] = purchaseRows.map((p) => ({
      kind: "add",
      id: `purchase:${p.id}`,
      ingredientName: p.ingredientSupplier.ingredient.name,
      ingredientUnit: p.ingredientSupplier.ingredient.unit,
      quantity: p.quantity,
      dollarValueInCents:
        typeof p.totalPriceInCents === "number"
          ? p.totalPriceInCents
          : p.totalPriceInCents.toNumber(),
      createdAt: p.createdAt.toISOString(),
      description: p.ingredientSupplier.supplier?.name ?? "",
    }));

    const merged = [...wastageEntries, ...purchaseEntries].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0
    );

    const pageEntries = merged.slice(cursor, cursor + limit);
    const nextCursor =
      pageEntries.length === limit && merged.length > cursor + limit
        ? cursor + limit
        : null;

    return { success: true, data: { entries: pageEntries, nextCursor } };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to load inventory log" };
  }
}

// ─── Per-Ingredient Display Unit ───────────────────────────

const updateIngredientDisplayUnitSchema = z.object({
  ingredientId: z.string().min(1),
  displayUnit: z.string().min(1).max(20).nullable(),
});

export async function updateIngredientDisplayUnit(
  input: z.infer<typeof updateIngredientDisplayUnitSchema>
): Promise<ActionResult<{ displayUnit: string | null }>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;
    const parsed = updateIngredientDisplayUnitSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    // Cafe-scope check + load ingredient.unit so we can validate dimension match.
    const ingredient = await prisma.ingredient.findFirst({
      where: { id: parsed.data.ingredientId, cafeId },
      select: { unit: true },
    });
    if (!ingredient) {
      return { success: false, error: "Ingredient not found" };
    }

    // Normalize: setting displayUnit equal to the storage unit is a no-op for
    // rendering AND a future unit change would silently promote the duplicate
    // into a real (wrong) conversion. Treat as clear instead of persisting.
    let normalized = parsed.data.displayUnit;
    if (normalized !== null && normalized === ingredient.unit) {
      normalized = null;
    }

    // Dimension match: null clears the override; non-null must share dimension
    // with the ingredient's storage unit. Cross-dimension is structurally
    // impossible from the picker but defended here.
    if (normalized !== null) {
      const ingredientDim = dimensionOf(ingredient.unit);
      const targetDim = dimensionOf(normalized);
      if (ingredientDim === null || targetDim === null) {
        return { success: false, error: "Display unit must be a known convertible unit" };
      }
      if (ingredientDim !== targetDim) {
        return { success: false, error: "Display unit must be in the same dimension as the ingredient unit" };
      }
    }

    await prisma.ingredient.update({
      where: { id: parsed.data.ingredientId },
      data: { displayUnit: normalized },
    });
    // The merged ingredients page surfaces the display unit (both views).
    revalidatePath("/ingredients");
    return { success: true, data: { displayUnit: normalized } };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    const message = e instanceof Error ? e.message : "Failed to update display unit";
    await logError({ context: "updateIngredientDisplayUnit", message });
    return { success: false, error: "Something went wrong. Please try again." };
  }
}
