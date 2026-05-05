import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    recipe: { findMany: vi.fn() },
    cafe: { findUnique: vi.fn() },
    ingredient: { findMany: vi.fn() },
    ingredientPurchase: { findMany: vi.fn() },
    salesEntry: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    inventoryCount: { findUnique: vi.fn(), update: vi.fn() },
    grabAndGoItem: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/threshold-check", () => ({
  checkThresholds: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/format", () => ({
  getCafeNow: () => new Date("2026-04-27T08:00:00Z"),
}));

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { submitDailyReport } from "./daily-report.actions";

const mockSession = {
  user: { id: "user-1", cafeId: "cafe-1", role: "STAFF" as const },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue(mockSession as never);
});

describe("submitDailyReport — idempotency (Patch 1)", () => {
  it("returns ALREADY_SUBMITTED when a SalesEntry already exists for today", async () => {
    // Recipe lookup before the txn — basic recipe with one ingredient that
    // wouldn't be reached because the idempotency check fires first.
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([
      {
        id: "rec-1",
        name: "Latte",
        sellingPriceInCents: 500,
        ingredients: [
          {
            ingredientId: "ing-1",
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

    // No ingredient meta calls expected because we never reach inventory step.
    vi.mocked(prisma.ingredient.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.ingredientPurchase.findMany).mockResolvedValue([] as never);

    const txSalesEntryFindFirst = vi
      .fn()
      .mockResolvedValue({ id: "existing-sales-entry" });
    const txSalesEntryCreate = vi.fn();
    const txConsume = vi.fn();

    vi.mocked(prisma.$transaction).mockImplementation((async (cb: unknown) => {
      if (typeof cb !== "function") return [];
      const tx = {
        salesEntry: {
          findFirst: txSalesEntryFindFirst,
          create: txSalesEntryCreate,
          update: vi.fn(),
        },
        inventoryCount: { findUnique: vi.fn(), update: vi.fn() },
        ingredientPurchase: {
          findMany: vi.fn().mockResolvedValue([]),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          aggregate: vi.fn().mockResolvedValue({ _sum: { remainingQuantity: 0 } }),
        },
        lotConsumption: { create: txConsume, findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
        grabAndGoItem: { findUnique: vi.fn(), update: vi.fn() },
      };
      return await (cb as (tx: unknown) => Promise<unknown>)(tx);
    }) as never);

    const result = await submitDailyReport({
      entries: [{ recipeId: "rec-1", qtySold: 1 }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("ALREADY_SUBMITTED");
    }
    // Critical: lot consume + sales entry create must NOT have run.
    expect(txSalesEntryCreate).not.toHaveBeenCalled();
    expect(txConsume).not.toHaveBeenCalled();
    // The findFirst guard did run.
    expect(txSalesEntryFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ cafeId: "cafe-1" }),
      })
    );
  });
});
