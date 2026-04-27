"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { getCafeNow } from "@/lib/format";
import { calculateDollarValue } from "@/lib/dollar-attribution";
import { checkThresholds } from "@/lib/threshold-check";
import type { ActionResult } from "@/types";

// ─── Schemas ────────────────────────────────────────────────

const updateIngredientConfigSchema = z.object({
  id: z.string().min(1),
  costPerUnitInCents: z.number().int().min(0).nullable().optional(),
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
  totalPriceInCents: z.number().int().min(0),
});

const saveCountSchema = z.object({
  ingredientId: z.string().min(1),
  quantity: z.number().int().min(0),
  expectedUpdatedAt: z.string().optional(),
});

const bulkConfirmSchema = z.object({
  ingredientIds: z.array(z.string().min(1)).min(1),
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

    const cafe = await prisma.cafe.findUnique({
      where: { id: cafeId },
      select: { timezone: true },
    });
    if (!cafe) return { success: false, error: "Cafe not found" };

    const today = getCafeNow(cafe.timezone);
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

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
        costPerUnitInCents: ing.costPerUnitInCents,
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

    const cafe = await prisma.cafe.findUnique({
      where: { id: cafeId },
      select: { timezone: true },
    });
    if (!cafe) return { success: false, error: "Cafe not found" };

    const today = getCafeNow(cafe.timezone);
    today.setHours(0, 0, 0, 0);

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
    await checkThresholds(cafeId, cafe.timezone, ingredientId);

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

    const cafe = await prisma.cafe.findUnique({
      where: { id: cafeId },
      select: { timezone: true },
    });
    if (!cafe) return { success: false, error: "Cafe not found" };

    const today = getCafeNow(cafe.timezone);
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

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
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;
    const parsed = createIngredientPurchaseSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const link = await prisma.ingredientSupplier.findFirst({
      where: { id: parsed.data.ingredientSupplierId, cafeId },
    });
    if (!link) {
      return { success: false, error: "Ingredient supplier not found" };
    }

    const purchase = await prisma.ingredientPurchase.create({
      data: {
        ingredientSupplierId: parsed.data.ingredientSupplierId,
        cafeId,
        quantity: parsed.data.quantity,
        unit: parsed.data.unit,
        totalPriceInCents: parsed.data.totalPriceInCents,
        createdById: session.user.id,
      },
    });

    return { success: true, data: { id: purchase.id } };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to log purchase" };
  }
}
