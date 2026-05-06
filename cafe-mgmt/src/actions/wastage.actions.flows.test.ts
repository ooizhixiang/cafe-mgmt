import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    ingredient: { findFirst: vi.fn() },
    cafe: { findUnique: vi.fn() },
    inventoryCount: { findUnique: vi.fn() },
    wastageEntry: { findFirst: vi.fn() },
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
  getCafeToday: () => new Date("2026-04-27T00:00:00Z"),
}));

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logWastage } from "./wastage.actions";

const mockSession = {
  user: { id: "user-1", cafeId: "cafe-1", role: "STAFF" as const },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue(mockSession as never);
});

// Helpers to bind a transaction mock with controllable lot/aggregate state.
type TxState = {
  aggregateRemaining: number;
  lotCount: number; // for hasAnyLot
  lots: Array<{
    id: string;
    remainingQuantity: number;
    quantity: number;
    totalPriceInCents: number;
  }>;
  wastageCreate: ReturnType<typeof vi.fn>;
  lotConsumptionCreate: ReturnType<typeof vi.fn>;
  ingredientPurchaseUpdateMany: ReturnType<typeof vi.fn>;
};

function bindTx(state: TxState) {
  vi.mocked(prisma.$transaction).mockImplementation((async (cb: unknown) => {
    if (typeof cb !== "function") return [];
    const tx = {
      ingredientPurchase: {
        aggregate: vi
          .fn()
          .mockResolvedValue({ _sum: { remainingQuantity: state.aggregateRemaining } }),
        count: vi.fn().mockResolvedValue(state.lotCount),
        findMany: vi.fn().mockResolvedValue(
          state.lots.map((l) => ({
            id: l.id,
            remainingQuantity: l.remainingQuantity,
            quantity: l.quantity,
            totalPriceInCents: l.totalPriceInCents,
          }))
        ),
        updateMany: state.ingredientPurchaseUpdateMany,
      },
      wastageEntry: {
        create: state.wastageCreate,
      },
      inventoryCount: {
        update: vi.fn(),
      },
      lotConsumption: {
        create: state.lotConsumptionCreate,
      },
    };
    return await (cb as (tx: unknown) => Promise<unknown>)(tx);
  }) as never);
}

describe("logWastage — Patch 2 (NO_LOTS_RECORDED)", () => {
  it("returns NO_LOTS_RECORDED when ingredient has zero purchase history (regardless of confirmOverDeduction)", async () => {
    vi.mocked(prisma.ingredient.findFirst).mockResolvedValue({
      id: "ing-1",
      cafeId: "cafe-1",
      costPerUnitInCents: null,
      manualCostOverride: false,
    } as never);
    vi.mocked(prisma.inventoryCount.findUnique).mockResolvedValue(null);

    const wastageCreate = vi.fn();
    const lotConsumptionCreate = vi.fn();
    bindTx({
      aggregateRemaining: 0,
      lotCount: 0, // no lots ever recorded
      lots: [],
      wastageCreate,
      lotConsumptionCreate,
      ingredientPurchaseUpdateMany: vi.fn().mockResolvedValue({ count: 1 }),
    });

    // Even with confirmOverDeduction = true, no-lots must hard-block.
    const result = await logWastage({
      ingredientId: "ing-1",
      quantity: 5,
      reason: "SPILLED",
      confirmOverDeduction: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("NO_LOTS_RECORDED");
    }
    expect(wastageCreate).not.toHaveBeenCalled();
    expect(lotConsumptionCreate).not.toHaveBeenCalled();
  });

  it("with confirmOverDeduction + lots exhausted (history exists), the consume proceeds (NO_LOTS_RECORDED block doesn't fire)", async () => {
    vi.mocked(prisma.ingredient.findFirst).mockResolvedValue({
      id: "ing-1",
      cafeId: "cafe-1",
      costPerUnitInCents: null,
      manualCostOverride: false,
    } as never);
    vi.mocked(prisma.inventoryCount.findUnique).mockResolvedValue(null);

    const wastageCreate = vi
      .fn()
      .mockResolvedValue({ id: "wast-1", quantity: 5 });
    const lotConsumptionCreate = vi.fn().mockResolvedValue({});
    bindTx({
      aggregateRemaining: 0, // exhausted
      lotCount: 1, // but a lot existed (now drained)
      lots: [], // remainingQuantity > 0 filter excludes the drained lot
      wastageCreate,
      lotConsumptionCreate,
      ingredientPurchaseUpdateMany: vi.fn().mockResolvedValue({ count: 1 }),
    });

    const result = await logWastage({
      ingredientId: "ing-1",
      quantity: 5,
      reason: "SPILLED",
      confirmOverDeduction: true,
    });

    expect(result.success).toBe(true);
    expect(wastageCreate).toHaveBeenCalled();
    // Over-deduction synthetic row written (qty 5, no lot, $0 price since lots
    // array is empty in this scenario — pure OVER_DEDUCTION).
    expect(lotConsumptionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          consumptionKind: "OVER_DEDUCTION",
          quantityConsumed: 5,
        }),
      })
    );
  });

  it("with confirmOverDeduction = false + lots exhausted (history exists), surfaces OVER_DEDUCTION error (not NO_LOTS_RECORDED)", async () => {
    vi.mocked(prisma.ingredient.findFirst).mockResolvedValue({
      id: "ing-1",
      cafeId: "cafe-1",
      costPerUnitInCents: null,
      manualCostOverride: false,
    } as never);
    vi.mocked(prisma.inventoryCount.findUnique).mockResolvedValue(null);

    const wastageCreate = vi.fn();
    const lotConsumptionCreate = vi.fn();
    bindTx({
      aggregateRemaining: 0,
      lotCount: 1,
      lots: [],
      wastageCreate,
      lotConsumptionCreate,
      ingredientPurchaseUpdateMany: vi.fn().mockResolvedValue({ count: 1 }),
    });

    const result = await logWastage({
      ingredientId: "ing-1",
      quantity: 5,
      reason: "SPILLED",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.startsWith("OVER_DEDUCTION:")).toBe(true);
      expect(result.error).not.toBe("NO_LOTS_RECORDED");
    }
    expect(wastageCreate).not.toHaveBeenCalled();
  });
});
