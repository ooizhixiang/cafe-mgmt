"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getCafeToday } from "@/lib/format";
import { currentCostPerUnit, findOldestNonEmptyLot } from "@/lib/fifo";
import { logError } from "@/lib/log-error";
import type { ActionResult } from "@/types";

// ─── Schemas ────────────────────────────────────────────────

const PAGE_SIZE = 10;

const getStocktakeSchema = z.object({
  id: z.string().min(1),
  tab: z.enum(["uncounted", "counted"]).default("uncounted"),
  page: z.number().int().min(1).default(1),
  search: z.string().max(120).optional(),
});

const saveStocktakeItemCountSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().int().min(0),
});

const completeStocktakeSchema = z.object({
  id: z.string().min(1),
});

const cancelStocktakeSchema = z.object({
  id: z.string().min(1),
});

// ─── Types ──────────────────────────────────────────────────

export type ActiveStocktakeRow = {
  id: string;
  startedAt: string;
  startedByName: string;
  totalItems: number;
  countedItems: number;
};

export type StocktakeMeta = {
  id: string;
  status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  startedAt: string;
  startedByName: string;
  totalItems: number;
  countedItems: number;
  uncountedItems: number;
};

export type StocktakeItemRow = {
  id: string;
  ingredientId: string;
  ingredientName: string;
  ingredientUnit: string;
  sku: string | null;
  barcode: string | null;
  expectedQuantity: number;
  countedQuantity: number | null;
  confirmedAt: string | null;
};

export type StocktakeView = {
  stocktake: StocktakeMeta;
  items: StocktakeItemRow[];
  page: number;
  totalPages: number;
  totalRecords: number;
  pageSize: number;
  tab: "uncounted" | "counted";
  search: string;
};

// ─── Actions ────────────────────────────────────────────────

export async function startStocktake(): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;
    const userId = session.user.id;

    const today = getCafeToday();

    const created = await prisma.$transaction(async (tx) => {
      const ingredients = await tx.ingredient.findMany({
        where: { cafeId },
        select: { id: true },
      });

      const ingredientIds = ingredients.map((i) => i.id);
      // Snapshot expectedQuantity from the most-recent prior InventoryCount
      // per ingredient — NOT just today's. A fresh-day stocktake started
      // before any morning count would otherwise default every ingredient
      // to 0, turning every counted unit into a phantom GAIN adjustment
      // and inflating reconciliation. Order desc + dedupe on first hit.
      const counts = ingredientIds.length
        ? await tx.inventoryCount.findMany({
            where: {
              cafeId,
              countDate: { lte: today },
              ingredientId: { in: ingredientIds },
            },
            orderBy: { countDate: "desc" },
            select: { ingredientId: true, quantity: true, countDate: true },
          })
        : [];
      const qtyByIngredient = new Map<string, number>();
      for (const c of counts) {
        if (!qtyByIngredient.has(c.ingredientId)) {
          qtyByIngredient.set(c.ingredientId, c.quantity);
        }
      }

      const stocktake = await tx.stocktake.create({
        data: {
          cafeId,
          startedById: userId,
        },
      });

      if (ingredientIds.length) {
        await tx.stocktakeItem.createMany({
          data: ingredients.map((ing) => ({
            stocktakeId: stocktake.id,
            ingredientId: ing.id,
            expectedQuantity: qtyByIngredient.get(ing.id) ?? 0,
          })),
        });
      }

      return stocktake;
    });

    return { success: true, data: { id: created.id } };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    const message = e instanceof Error ? e.message : "Failed to start stocktake";
    await logError({ context: "startStocktake", message });
    return { success: false, error: "Failed to start stocktake" };
  }
}

export async function getActiveStocktakes(): Promise<
  ActionResult<{ stocktakes: ActiveStocktakeRow[] }>
> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;

    const rows = await prisma.stocktake.findMany({
      where: { cafeId, status: "IN_PROGRESS" },
      orderBy: { startedAt: "desc" },
      include: {
        startedBy: { select: { name: true } },
        items: {
          select: { id: true, countedQuantity: true },
        },
      },
    });

    const stocktakes: ActiveStocktakeRow[] = rows.map((r) => ({
      id: r.id,
      startedAt: r.startedAt.toISOString(),
      startedByName: r.startedBy.name,
      totalItems: r.items.length,
      countedItems: r.items.filter((i) => i.countedQuantity !== null).length,
    }));

    return { success: true, data: { stocktakes } };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to load stocktakes" };
  }
}

export async function getStocktake(
  input: z.infer<typeof getStocktakeSchema>
): Promise<ActionResult<StocktakeView>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;

    const parsed = getStocktakeSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const { id, tab, page, search } = parsed.data;

    const stocktake = await prisma.stocktake.findFirst({
      where: { id, cafeId },
      include: {
        startedBy: { select: { name: true } },
        items: {
          select: { id: true, countedQuantity: true },
        },
      },
    });
    if (!stocktake) {
      return { success: false, error: "Stocktake not found" };
    }

    const totalItems = stocktake.items.length;
    const countedItems = stocktake.items.filter(
      (i) => i.countedQuantity !== null
    ).length;
    const uncountedItems = totalItems - countedItems;

    const trimmedSearch = (search ?? "").trim();

    const baseFilter = {
      stocktakeId: id,
      ...(tab === "counted"
        ? { countedQuantity: { not: null } }
        : { countedQuantity: null }),
      ...(trimmedSearch
        ? {
            ingredient: {
              OR: [
                { name: { contains: trimmedSearch, mode: "insensitive" as const } },
                { sku: { contains: trimmedSearch, mode: "insensitive" as const } },
                { barcode: { contains: trimmedSearch, mode: "insensitive" as const } },
              ],
            },
          }
        : {}),
    };

    const totalRecords = await prisma.stocktakeItem.count({
      where: baseFilter,
    });
    const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));
    const safePage = Math.min(Math.max(1, page), totalPages);

    const items = await prisma.stocktakeItem.findMany({
      where: baseFilter,
      include: {
        ingredient: {
          select: { id: true, name: true, unit: true, sku: true, barcode: true },
        },
      },
      orderBy: [{ ingredient: { name: "asc" } }],
      skip: (safePage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });

    const data: StocktakeView = {
      stocktake: {
        id: stocktake.id,
        status: stocktake.status,
        startedAt: stocktake.startedAt.toISOString(),
        startedByName: stocktake.startedBy.name,
        totalItems,
        countedItems,
        uncountedItems,
      },
      items: items.map((i) => ({
        id: i.id,
        ingredientId: i.ingredient.id,
        ingredientName: i.ingredient.name,
        ingredientUnit: i.ingredient.unit,
        sku: i.ingredient.sku,
        barcode: i.ingredient.barcode,
        expectedQuantity: i.expectedQuantity,
        countedQuantity: i.countedQuantity,
        confirmedAt: i.confirmedAt?.toISOString() ?? null,
      })),
      page: safePage,
      totalPages,
      totalRecords,
      pageSize: PAGE_SIZE,
      tab,
      search: trimmedSearch,
    };

    return { success: true, data };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to load stocktake" };
  }
}

export async function saveStocktakeItemCount(
  input: z.infer<typeof saveStocktakeItemCountSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;
    const userId = session.user.id;

    const parsed = saveStocktakeItemCountSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const item = await prisma.stocktakeItem.findFirst({
      where: {
        id: parsed.data.itemId,
        stocktake: { cafeId, status: "IN_PROGRESS" },
      },
      select: { id: true },
    });
    if (!item) {
      return { success: false, error: "Item not found" };
    }

    await prisma.stocktakeItem.update({
      where: { id: item.id },
      data: {
        countedQuantity: parsed.data.quantity,
        confirmedAt: new Date(),
        confirmedById: userId,
      },
    });

    return { success: true, data: { id: item.id } };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to save count" };
  }
}

export async function completeStocktake(
  input: z.infer<typeof completeStocktakeSchema>
): Promise<
  ActionResult<{
    wastageCount: number;
    adjustmentCount: number;
    skippedCount: number;
  }>
> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;
    const userId = session.user.id;

    const parsed = completeStocktakeSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Invalid input" };
    }

    const today = getCafeToday();

    const result = await prisma.$transaction(async (tx) => {
      const stocktake = await tx.stocktake.findFirst({
        where: { id: parsed.data.id, cafeId },
        include: {
          items: true,
        },
      });
      if (!stocktake) {
        throw new Error("__NOT_FOUND__");
      }
      // Race guard: claim the stocktake by atomically flipping its status.
      // updateMany returns the row count; if 0 it means another concurrent
      // completeStocktake call already finalized it — bail without writing
      // wastage/adjustments/inventory bumps so we don't double-count.
      const claimed = await tx.stocktake.updateMany({
        where: { id: stocktake.id, status: "IN_PROGRESS" },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          completedById: userId,
        },
      });
      if (claimed.count === 0) {
        throw new Error("__NOT_IN_PROGRESS__");
      }

      const ingredientIds = stocktake.items.map((i) => i.ingredientId);

      // Pull ingredients (for cost basis) and their lots in one pass each so
      // currentCostPerUnit can be computed without N+1 queries.
      const ingredients = ingredientIds.length
        ? await tx.ingredient.findMany({
            where: { id: { in: ingredientIds } },
            select: {
              id: true,
              manualCostOverride: true,
              costPerUnitInCents: true,
            },
          })
        : [];
      const lots = ingredientIds.length
        ? await tx.ingredientPurchase.findMany({
            where: {
              cafeId,
              ingredientSupplier: {
                ingredientId: { in: ingredientIds },
              },
            },
            select: {
              id: true,
              createdAt: true,
              remainingQuantity: true,
              quantity: true,
              totalPriceInCents: true,
              ingredientSupplier: { select: { ingredientId: true } },
            },
          })
        : [];

      const ingredientById = new Map(
        ingredients.map((ing) => [
          ing.id,
          {
            manualCostOverride: ing.manualCostOverride,
            costPerUnitInCents:
              ing.costPerUnitInCents === null
                ? null
                : ing.costPerUnitInCents.toNumber(),
          },
        ])
      );

      const lotsByIngredient = new Map<
        string,
        Array<{
          id: string;
          createdAt: Date;
          remainingQuantity: number;
          quantity: number;
          totalPriceInCents: number;
        }>
      >();
      for (const lot of lots) {
        const ingId = lot.ingredientSupplier.ingredientId;
        const list = lotsByIngredient.get(ingId) ?? [];
        list.push({
          id: lot.id,
          createdAt: lot.createdAt,
          remainingQuantity: lot.remainingQuantity,
          quantity: lot.quantity,
          totalPriceInCents:
            typeof lot.totalPriceInCents === "number"
              ? lot.totalPriceInCents
              : lot.totalPriceInCents.toNumber(),
        });
        lotsByIngredient.set(ingId, list);
      }

      let wastageCount = 0;
      let adjustmentCount = 0;
      let skippedCount = 0;

      for (const item of stocktake.items) {
        if (item.countedQuantity === null) {
          skippedCount++;
          continue;
        }

        const counted = item.countedQuantity;
        const expected = item.expectedQuantity;
        const ingMeta = ingredientById.get(item.ingredientId) ?? {
          manualCostOverride: true,
          costPerUnitInCents: null,
        };
        const oldestLot = findOldestNonEmptyLot(
          lotsByIngredient.get(item.ingredientId) ?? []
        );
        const derivedCost = currentCostPerUnit(ingMeta, oldestLot) ?? 0;

        if (counted < expected) {
          const variance = expected - counted;
          await tx.wastageEntry.create({
            data: {
              cafeId,
              ingredientId: item.ingredientId,
              quantity: variance,
              reason: "INCORRECT",
              dollarValueInCents: Math.round(variance * derivedCost),
              createdById: userId,
            },
          });
          wastageCount++;
        } else if (counted > expected) {
          const variance = counted - expected;
          await tx.inventoryAdjustment.create({
            data: {
              cafeId,
              ingredientId: item.ingredientId,
              kind: "GAIN",
              quantity: variance,
              dollarValueInCents: Math.round(variance * derivedCost),
              stocktakeId: stocktake.id,
              createdById: userId,
            },
          });
          adjustmentCount++;
        }

        // Always upsert today's count to the counted value (idempotent on match).
        await tx.inventoryCount.upsert({
          where: {
            ingredientId_countDate: {
              ingredientId: item.ingredientId,
              countDate: today,
            },
          },
          create: {
            ingredientId: item.ingredientId,
            cafeId,
            countDate: today,
            quantity: counted,
            confirmedById: userId,
            confirmedAt: new Date(),
          },
          update: {
            quantity: counted,
            confirmedById: userId,
            confirmedAt: new Date(),
          },
        });
      }

      // Status flip + completedAt/By already happened up-front via the
      // race-guard updateMany above. Nothing more to do here.

      return { wastageCount, adjustmentCount, skippedCount };
    });

    return { success: true, data: result };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    if (e instanceof Error && e.message === "__NOT_FOUND__") {
      return { success: false, error: "Stocktake not found" };
    }
    if (e instanceof Error && e.message === "__NOT_IN_PROGRESS__") {
      return { success: false, error: "Stocktake is not in progress" };
    }
    const message = e instanceof Error ? e.message : "Failed to complete stocktake";
    await logError({ context: "completeStocktake", message });
    return { success: false, error: "Failed to complete stocktake" };
  }
}

export async function cancelStocktake(
  input: z.infer<typeof cancelStocktakeSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;
    const userId = session.user.id;

    const parsed = cancelStocktakeSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Invalid input" };
    }

    const stocktake = await prisma.stocktake.findFirst({
      where: { id: parsed.data.id, cafeId, status: "IN_PROGRESS" },
      select: { id: true },
    });
    if (!stocktake) {
      return { success: false, error: "Stocktake not found or already finalized" };
    }

    await prisma.stocktake.update({
      where: { id: stocktake.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledById: userId,
      },
    });

    return { success: true, data: { id: stocktake.id } };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to cancel stocktake" };
  }
}
