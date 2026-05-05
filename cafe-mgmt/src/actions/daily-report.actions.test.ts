import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    recipe: { findMany: vi.fn() },
    cafe: { findUnique: vi.fn() },
    ingredient: { findMany: vi.fn() },
    ingredientPurchase: { findMany: vi.fn() },
    salesEntry: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    inventoryCount: { findUnique: vi.fn(), update: vi.fn() },
    grabAndGoItem: { findUnique: vi.fn(), update: vi.fn() },
    lotConsumption: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn(),
  requireRole: vi.fn(),
}));

vi.mock("@/lib/threshold-check", () => ({
  checkThresholds: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/format", () => ({
  getCafeNow: () => new Date("2026-04-27T08:00:00Z"),
}));

vi.mock("@/lib/lot-consume", () => ({
  applyConsumeFifo: vi.fn().mockResolvedValue({ totalCostInCents: 100 }),
  applyRestoreFifo: vi.fn().mockResolvedValue(undefined),
  encodeOverDeductionError: vi.fn(),
  getAvailableQty: vi.fn(),
  hasAnyLot: vi.fn(),
  LOT_RACE: "LOT_RACE",
}));

import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { applyRestoreFifo } from "@/lib/lot-consume";
import {
  submitDailyReport,
  getSalesHistory,
  voidSalesSubmission,
} from "./daily-report.actions";

const mockSession = {
  user: { id: "user-1", cafeId: "cafe-1", role: "STAFF" as const },
};
const mockManagerSession = {
  user: { id: "mgr-1", cafeId: "cafe-1", role: "MANAGER" as const },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue(mockSession as never);
  vi.mocked(requireRole).mockResolvedValue(mockManagerSession as never);
});

// ─── submitDailyReport: multi-submission per day ───────────

describe("submitDailyReport — multi-submission per day", () => {
  function setupRecipeMocks() {
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      {
        id: "rec-1",
        name: "Latte",
        sellingPriceInCents: 500,
        ingredients: [
          {
            id: "ri-1",
            ingredientId: "ing-1",
            subRecipeId: null,
            quantityPerServing: 1,
            subtotalOverrideInCents: null,
            ingredient: {
              id: "ing-1",
              name: "Milk",
              unit: "ml",
              costPerUnitInCents: { toNumber: () => 10 },
            },
          },
        ],
        variations: [],
      },
    ] as never);

    // recipe registry call (cafe-wide for sub-recipe expansion)
    vi.mocked(prisma.recipe.findMany).mockResolvedValueOnce([
      {
        id: "rec-1",
        name: "Latte",
        sellingPriceInCents: 500,
        ingredients: [
          {
            id: "ri-1",
            ingredientId: "ing-1",
            subRecipeId: null,
            quantityPerServing: 1,
            subtotalOverrideInCents: null,
            ingredient: {
              id: "ing-1",
              name: "Milk",
              unit: "ml",
              costPerUnitInCents: { toNumber: () => 10 },
            },
          },
        ],
        variations: [],
      },
    ] as never);
    vi.mocked(prisma.recipe.findMany).mockResolvedValueOnce([
      {
        id: "rec-1",
        yieldQuantity: null,
        yieldUnit: null,
        ingredients: [
          {
            ingredientId: "ing-1",
            subRecipeId: null,
            quantityPerServing: 1,
          },
        ],
      },
    ] as never);

    vi.mocked(prisma.ingredient.findMany).mockResolvedValue([
      {
        id: "ing-1",
        name: "Milk",
        unit: "ml",
        costPerUnitInCents: { toNumber: () => 10 },
        manualCostOverride: true,
      },
    ] as never);
    vi.mocked(prisma.ingredientPurchase.findMany).mockResolvedValue([] as never);
  }

  it("two sequential submitDailyReport calls both succeed and stamp distinct submissionIds on the same saleDate", async () => {
    const captured: Array<{ saleDate: unknown; submissionId: unknown }> = [];

    vi.mocked(prisma.$transaction).mockImplementation((async (
      cb: unknown
    ) => {
      if (typeof cb !== "function") return [];
      const tx = {
        salesEntry: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn(async (args: { data: Record<string, unknown> }) => {
            captured.push({
              saleDate: args.data.saleDate,
              submissionId: args.data.submissionId,
            });
            return { id: `sales-${captured.length}` };
          }),
          update: vi.fn(),
        },
        inventoryCount: {
          findUnique: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
        },
        grabAndGoItem: { findUnique: vi.fn(), update: vi.fn() },
      };
      return await (cb as (tx: unknown) => Promise<unknown>)(tx);
    }) as never);

    setupRecipeMocks();
    const r1 = await submitDailyReport({
      entries: [{ recipeId: "rec-1", qtySold: 1 }],
    });
    expect(r1.success).toBe(true);

    // Reset mocks for second call but keep $transaction implementation.
    vi.mocked(prisma.recipe.findMany).mockReset();
    vi.mocked(prisma.ingredient.findMany).mockReset();
    vi.mocked(prisma.ingredientPurchase.findMany).mockReset();
    setupRecipeMocks();

    const r2 = await submitDailyReport({
      entries: [{ recipeId: "rec-1", qtySold: 2 }],
    });
    expect(r2.success).toBe(true);

    expect(captured).toHaveLength(2);
    // Same saleDate.
    expect(String(captured[0].saleDate)).toBe(String(captured[1].saleDate));
    // Distinct submissionIds.
    expect(captured[0].submissionId).toBeTypeOf("string");
    expect(captured[1].submissionId).toBeTypeOf("string");
    expect(captured[0].submissionId).not.toBe(captured[1].submissionId);
  });
});

// ─── voidSalesSubmission ────────────────────────────────────

describe("voidSalesSubmission", () => {
  it("rejects non-manager with Unauthorized and writes nothing", async () => {
    vi.mocked(requireRole).mockRejectedValueOnce(new Error("Unauthorized"));

    const result = await voidSalesSubmission({ submissionId: "sub-1" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Unauthorized");
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.salesEntry.findMany).not.toHaveBeenCalled();
  });

  it("marks all rows voided + restores FIFO via applyRestoreFifo", async () => {
    vi.mocked(prisma.salesEntry.findMany).mockResolvedValue([
      { id: "sales-1" },
      { id: "sales-2" },
    ] as never);

    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const inventoryUpdate = vi.fn().mockResolvedValue({});

    vi.mocked(prisma.$transaction).mockImplementation((async (
      cb: unknown
    ) => {
      if (typeof cb !== "function") return [];
      const tx = {
        salesEntry: { updateMany },
        lotConsumption: {
          findMany: vi.fn().mockResolvedValue([
            {
              quantityConsumed: 5,
              ingredientPurchaseId: "lot-a",
              consumptionKind: "LOT",
              ingredientPurchase: {
                ingredientSupplier: { ingredientId: "ing-1" },
              },
            },
            {
              quantityConsumed: 3,
              ingredientPurchaseId: "lot-a",
              consumptionKind: "LOT",
              ingredientPurchase: {
                ingredientSupplier: { ingredientId: "ing-1" },
              },
            },
          ]),
        },
        ingredient: {
          findMany: vi.fn().mockResolvedValue([
            { id: "ing-1", manualCostOverride: false, costPerUnitInCents: { toNumber: () => 100 } },
          ]),
        },
        ingredientPurchase: {
          findMany: vi.fn().mockResolvedValue([
            { quantity: 10, totalPriceInCents: { toNumber: () => 800 }, ingredientSupplier: { ingredientId: "ing-1" } },
          ]),
        },
        inventoryCount: {
          findUnique: vi.fn().mockResolvedValue({
            id: "ic-1",
            quantity: 10,
          }),
          update: inventoryUpdate,
        },
      };
      return await (cb as (tx: unknown) => Promise<unknown>)(tx);
    }) as never);

    const result = await voidSalesSubmission({
      submissionId: "sub-1",
      reason: "Mistake",
    });

    expect(result.success).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["sales-1", "sales-2"] } },
      data: expect.objectContaining({
        voidedById: "mgr-1",
        voidReason: "Mistake",
      }),
    });
    // applyRestoreFifo called once per sales row.
    expect(applyRestoreFifo).toHaveBeenCalledTimes(2);
    // InventoryCount restored: 10 + (5 + 3) = 18; dollarValueInCents
    // recomputed using oldest lot price (800/10 = 80c per unit) → 18 * 80 = 1440.
    expect(inventoryUpdate).toHaveBeenCalledWith({
      where: { id: "ic-1" },
      data: { quantity: 18, dollarValueInCents: 1440 },
    });
  });

  it("is idempotent on already-voided submission (no double-restore)", async () => {
    vi.mocked(prisma.salesEntry.findMany).mockResolvedValue([] as never);

    const result = await voidSalesSubmission({ submissionId: "sub-1" });

    expect(result.success).toBe(true);
    // No transaction was opened.
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(applyRestoreFifo).not.toHaveBeenCalled();
  });
});

// ─── getSalesHistory ────────────────────────────────────────

describe("getSalesHistory", () => {
  it("merges qty/revenue/cost across non-voided submissions and excludes voided rows", async () => {
    vi.mocked(prisma.salesEntry.findMany).mockResolvedValue([
      {
        id: "s1",
        saleDate: new Date("2026-04-27T00:00:00Z"),
        recipeName: "Latte",
        qtySold: 5,
        revenueInCents: 2500,
        costInCents: 500,
        submissionId: "sub-A",
        voidedAt: null,
        createdAt: new Date("2026-04-27T10:00:00Z"),
        createdBy: { name: "Alice" },
      },
      {
        id: "s2",
        saleDate: new Date("2026-04-27T00:00:00Z"),
        recipeName: "Latte",
        qtySold: 3,
        revenueInCents: 1500,
        costInCents: 300,
        submissionId: "sub-B",
        voidedAt: null,
        createdAt: new Date("2026-04-27T14:00:00Z"),
        createdBy: { name: "Bob" },
      },
      {
        id: "s3",
        saleDate: new Date("2026-04-27T00:00:00Z"),
        recipeName: "Mocha",
        qtySold: 99,
        revenueInCents: 49500,
        costInCents: 9900,
        submissionId: "sub-C",
        voidedAt: new Date("2026-04-27T16:00:00Z"),
        createdAt: new Date("2026-04-27T15:00:00Z"),
        createdBy: { name: "Carl" },
      },
    ] as never);

    const result = await getSalesHistory();

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(1);
    const day = result.data[0];
    expect(day.saleDate).toBe("2026-04-27");
    expect(day.submissions).toHaveLength(3);
    // Merged Latte = 5 + 3 = 8; voided Mocha excluded.
    expect(day.mergedByRecipe).toEqual([
      {
        recipeName: "Latte",
        qtySold: 8,
        revenueInCents: 4000,
        costInCents: 800,
      },
    ]);
  });
});
