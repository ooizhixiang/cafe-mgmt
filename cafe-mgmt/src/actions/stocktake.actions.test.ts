import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    ingredient: { findMany: vi.fn() },
    inventoryCount: { findMany: vi.fn() },
    stocktake: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
    stocktakeItem: {
      createMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    inventoryAdjustment: { create: vi.fn() },
    wastageEntry: { create: vi.fn() },
    ingredientPurchase: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({
  requireRole: vi.fn(),
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/format", () => ({
  getCafeToday: () => new Date("2026-05-08T00:00:00Z"),
  getCafeNow: () => new Date("2026-05-08T08:00:00Z"),
}));

vi.mock("@/lib/log-error", () => ({
  logError: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import {
  startStocktake,
  saveStocktakeItemCount,
  completeStocktake,
  cancelStocktake,
} from "./stocktake.actions";

const managerSession = {
  user: {
    id: "user-mgr",
    cafeId: "cafe-1",
    role: "MANAGER" as const,
    isActive: true,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue(managerSession as never);
});

// Helper: bind a $transaction mock that exposes the same method surface as the
// real Prisma client. Tests can override individual methods via `overrides`.
function bindTx(overrides: Record<string, unknown> = {}) {
  vi.mocked(prisma.$transaction).mockImplementation(async (cb: unknown) => {
    if (typeof cb !== "function") return [];
    const tx: Record<string, unknown> = {
      ingredient: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      inventoryCount: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue({}),
      },
      stocktake: {
        create: vi.fn().mockResolvedValue({ id: "st-new" }),
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
      },
      stocktakeItem: {
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      ingredientPurchase: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      wastageEntry: {
        create: vi.fn().mockResolvedValue({ id: "w-1" }),
      },
      inventoryAdjustment: {
        create: vi.fn().mockResolvedValue({ id: "adj-1" }),
      },
      ...overrides,
    };
    return await (cb as (tx: unknown) => Promise<unknown>)(tx);
  });
  return null;
}

describe("startStocktake", () => {
  it("creates Stocktake + StocktakeItem rows with expectedQuantity from today's count", async () => {
    const ingredientFindMany = vi.fn().mockResolvedValue([
      { id: "ing-a" },
      { id: "ing-b" },
    ]);
    const inventoryCountFindMany = vi.fn().mockResolvedValue([
      { ingredientId: "ing-a", quantity: 7 },
      // ing-b has no count today → should snapshot to 0
    ]);
    const stocktakeCreate = vi.fn().mockResolvedValue({ id: "st-1" });
    const stocktakeItemCreateMany = vi.fn().mockResolvedValue({ count: 2 });

    bindTx({
      ingredient: { findMany: ingredientFindMany },
      inventoryCount: { findMany: inventoryCountFindMany },
      stocktake: { create: stocktakeCreate },
      stocktakeItem: { createMany: stocktakeItemCreateMany },
    });

    const result = await startStocktake();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("st-1");
    }

    expect(stocktakeCreate).toHaveBeenCalledWith({
      data: { cafeId: "cafe-1", startedById: "user-mgr" },
    });

    const args = stocktakeItemCreateMany.mock.calls[0]![0]!;
    const items = (args as { data: Array<Record<string, unknown>> }).data;
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.ingredientId === "ing-a")!.expectedQuantity).toBe(7);
    expect(items.find((i) => i.ingredientId === "ing-b")!.expectedQuantity).toBe(0);
  });
});

describe("saveStocktakeItemCount", () => {
  it("rejects negative quantity at the schema layer", async () => {
    const result = await saveStocktakeItemCount({
      itemId: "item-1",
      quantity: -1,
    });
    expect(result.success).toBe(false);
  });

  it("sets countedQuantity, confirmedAt, confirmedById on the row", async () => {
    vi.mocked(prisma.stocktakeItem.findFirst).mockResolvedValue({ id: "item-1" } as never);
    const updateMock = vi.fn().mockResolvedValue({});
    vi.mocked(prisma.stocktakeItem.update).mockImplementation(updateMock as never);

    const result = await saveStocktakeItemCount({ itemId: "item-1", quantity: 12 });
    expect(result.success).toBe(true);

    const arg = updateMock.mock.calls[0]![0]!;
    expect(arg.where).toEqual({ id: "item-1" });
    expect(arg.data.countedQuantity).toBe(12);
    expect(arg.data.confirmedById).toBe("user-mgr");
    expect(arg.data.confirmedAt).toBeInstanceOf(Date);
  });
});

describe("completeStocktake", () => {
  function buildStocktake(items: Array<{
    id: string;
    ingredientId: string;
    expectedQuantity: number;
    countedQuantity: number | null;
  }>) {
    return {
      id: "st-1",
      cafeId: "cafe-1",
      status: "IN_PROGRESS" as const,
      items,
    };
  }

  it("writes WastageEntry { reason: INCORRECT } for counted < expected", async () => {
    const wastageCreate = vi.fn().mockResolvedValue({ id: "w-1" });
    const adjustmentCreate = vi.fn().mockResolvedValue({ id: "adj-1" });
    const inventoryUpsert = vi.fn().mockResolvedValue({});
    const stocktakeUpdate = vi.fn().mockResolvedValue({});

    bindTx({
      stocktake: {
        findFirst: vi
          .fn()
          .mockResolvedValue(
            buildStocktake([
              { id: "i1", ingredientId: "ing-a", expectedQuantity: 8, countedQuantity: 5 },
            ])
          ),
        update: stocktakeUpdate,
        // Race-guard claim: completeStocktake flips status via updateMany
        // and only proceeds with variance writes when count === 1.
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      ingredient: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: "ing-a", manualCostOverride: true, costPerUnitInCents: { toNumber: () => 200 } },
          ]),
      },
      ingredientPurchase: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      wastageEntry: { create: wastageCreate },
      inventoryAdjustment: { create: adjustmentCreate },
      inventoryCount: { upsert: inventoryUpsert },
    });

    const result = await completeStocktake({ id: "st-1" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.wastageCount).toBe(1);
      expect(result.data.adjustmentCount).toBe(0);
    }

    expect(wastageCreate).toHaveBeenCalledTimes(1);
    const wastageArg = wastageCreate.mock.calls[0]![0]!.data;
    expect(wastageArg.reason).toBe("INCORRECT");
    expect(wastageArg.quantity).toBe(3); // 8 - 5
    expect(wastageArg.dollarValueInCents).toBe(3 * 200);
    expect(adjustmentCreate).not.toHaveBeenCalled();

    const upsertArg = inventoryUpsert.mock.calls[0]![0]!;
    expect(upsertArg.update.quantity).toBe(5);
    // Status flip moved to the up-front updateMany race-guard claim; the
    // singular update call is no longer used.
    expect(stocktakeUpdate).not.toHaveBeenCalled();
  });

  it("writes InventoryAdjustment { kind: GAIN } for counted > expected", async () => {
    const wastageCreate = vi.fn();
    const adjustmentCreate = vi.fn().mockResolvedValue({ id: "adj-1" });
    const inventoryUpsert = vi.fn().mockResolvedValue({});

    bindTx({
      stocktake: {
        findFirst: vi
          .fn()
          .mockResolvedValue(
            buildStocktake([
              { id: "i1", ingredientId: "ing-a", expectedQuantity: 8, countedQuantity: 12 },
            ])
          ),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      ingredient: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: "ing-a", manualCostOverride: true, costPerUnitInCents: { toNumber: () => 150 } },
          ]),
      },
      ingredientPurchase: { findMany: vi.fn().mockResolvedValue([]) },
      wastageEntry: { create: wastageCreate },
      inventoryAdjustment: { create: adjustmentCreate },
      inventoryCount: { upsert: inventoryUpsert },
    });

    const result = await completeStocktake({ id: "st-1" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.adjustmentCount).toBe(1);
      expect(result.data.wastageCount).toBe(0);
    }

    expect(adjustmentCreate).toHaveBeenCalledTimes(1);
    const arg = adjustmentCreate.mock.calls[0]![0]!.data;
    expect(arg.kind).toBe("GAIN");
    expect(arg.quantity).toBe(4); // 12 - 8
    expect(arg.dollarValueInCents).toBe(4 * 150);
    expect(arg.stocktakeId).toBe("st-1");
    expect(wastageCreate).not.toHaveBeenCalled();

    expect(inventoryUpsert.mock.calls[0]![0]!.update.quantity).toBe(12);
  });

  it("skips uncounted items: no wastage, no adjustment, no inventory write", async () => {
    const wastageCreate = vi.fn();
    const adjustmentCreate = vi.fn();
    const inventoryUpsert = vi.fn();

    bindTx({
      stocktake: {
        findFirst: vi
          .fn()
          .mockResolvedValue(
            buildStocktake([
              { id: "i1", ingredientId: "ing-a", expectedQuantity: 5, countedQuantity: null },
            ])
          ),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      ingredient: { findMany: vi.fn().mockResolvedValue([{ id: "ing-a", manualCostOverride: true, costPerUnitInCents: { toNumber: () => 100 } }]) },
      ingredientPurchase: { findMany: vi.fn().mockResolvedValue([]) },
      wastageEntry: { create: wastageCreate },
      inventoryAdjustment: { create: adjustmentCreate },
      inventoryCount: { upsert: inventoryUpsert },
    });

    const result = await completeStocktake({ id: "st-1" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skippedCount).toBe(1);
      expect(result.data.wastageCount).toBe(0);
      expect(result.data.adjustmentCount).toBe(0);
    }

    expect(wastageCreate).not.toHaveBeenCalled();
    expect(adjustmentCreate).not.toHaveBeenCalled();
    expect(inventoryUpsert).not.toHaveBeenCalled();
  });

  it("uses dollarValueInCents = 0 when derivedCost is null", async () => {
    const wastageCreate = vi.fn().mockResolvedValue({ id: "w-1" });

    bindTx({
      stocktake: {
        findFirst: vi
          .fn()
          .mockResolvedValue(
            buildStocktake([
              { id: "i1", ingredientId: "ing-a", expectedQuantity: 5, countedQuantity: 3 },
            ])
          ),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      ingredient: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: "ing-a", manualCostOverride: true, costPerUnitInCents: null },
          ]),
      },
      ingredientPurchase: { findMany: vi.fn().mockResolvedValue([]) },
      wastageEntry: { create: wastageCreate },
      inventoryAdjustment: { create: vi.fn() },
      inventoryCount: { upsert: vi.fn().mockResolvedValue({}) },
    });

    const result = await completeStocktake({ id: "st-1" });
    expect(result.success).toBe(true);
    expect(wastageCreate.mock.calls[0]![0]!.data.dollarValueInCents).toBe(0);
  });
});

describe("cancelStocktake", () => {
  it("flips status to CANCELLED with no other writes", async () => {
    vi.mocked(prisma.stocktake.findFirst).mockResolvedValue({ id: "st-1" } as never);
    const updateMock = vi.fn().mockResolvedValue({});
    vi.mocked(prisma.stocktake.update).mockImplementation(updateMock as never);

    const result = await cancelStocktake({ id: "st-1" });
    expect(result.success).toBe(true);

    const arg = updateMock.mock.calls[0]![0]!;
    expect(arg.where).toEqual({ id: "st-1" });
    expect(arg.data.status).toBe("CANCELLED");
    expect(arg.data.cancelledById).toBe("user-mgr");
    expect(arg.data.cancelledAt).toBeInstanceOf(Date);

    // No wastage / adjustment / inventory writes
    expect(prisma.wastageEntry.create).not.toHaveBeenCalled();
    expect(prisma.inventoryAdjustment.create).not.toHaveBeenCalled();
  });
});

describe("manager-only gating", () => {
  it("rejects non-manager via requireRole", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const r = await startStocktake();
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe("Unauthorized");
  });
});
