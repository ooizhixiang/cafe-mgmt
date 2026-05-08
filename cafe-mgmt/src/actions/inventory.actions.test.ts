import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// ─── Mocks for bulkCreateIngredientPurchases tests ─────────

vi.mock("@/lib/db", () => ({
  prisma: {
    supplier: { findFirst: vi.fn() },
    ingredient: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    ingredientSupplier: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    ingredientPurchase: { create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    wastageEntry: { findMany: vi.fn() },
    inventoryAdjustment: { findMany: vi.fn() },
    errorLog: { create: vi.fn() },
    cafe: { findUnique: vi.fn() },
    inventoryCount: { findUnique: vi.fn(), findFirst: vi.fn(), upsert: vi.fn() },
    recipeIngredient: { findMany: vi.fn() },
    variationIngredient: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn(),
  requireRole: vi.fn(),
}));

vi.mock("@/lib/log-error", () => ({
  logError: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/threshold-check", () => ({
  checkThresholds: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import {
  bulkCreateIngredientPurchases,
  createIngredientPurchase,
  setManualCostOverride,
  attachPurchaseInvoice,
  detachPurchaseInvoice,
  getPurchaseHistory,
  updateIngredientDisplayUnit,
  getInventoryLog,
} from "./inventory.actions";

// Prisma Decimal stub — mock rows go through `.toNumber()` and never run real
// Decimal arithmetic, so a minimal shape is enough.
function dec(n: number) {
  return { toNumber: () => n };
}

const mockSession = {
  user: { id: "user-1", cafeId: "cafe-1", role: "STAFF" as const },
};

const mockManagerSession = {
  user: { id: "user-1", cafeId: "cafe-1", role: "MANAGER" as const },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue(mockSession as never);
  vi.mocked(requireRole).mockResolvedValue(mockManagerSession as never);
  // Cafe lookup no longer needed for timezone (locked to Asia/Kuala_Lumpur via
  // CAFE_TIMEZONE constant). Default to a present cafe so any remaining
  // findUnique calls in actions don't return null. Tests that need a specific
  // cafe shape override per-test.
  vi.mocked(prisma.cafe.findUnique).mockResolvedValue({} as never);
  // Pre-txn ingredient.findMany now runs outside the bulk-purchase txn (used
  // to look up storage units for the convert() pre-validation). Default to
  // an empty list so legacy tests that don't mock it still run; per-test
  // overrides supply real ingredient unit data.
  vi.mocked(prisma.ingredient.findMany).mockResolvedValue([] as never);
  // Stocktake feature added inventoryAdjustment as a third source for
  // getInventoryLog. Default to empty so pre-existing tests that don't mock it
  // continue to compose wastage + purchase without a "method not a function" /
  // undefined-promise crash inside Promise.all.
  vi.mocked(prisma.inventoryAdjustment.findMany).mockResolvedValue([] as never);
});

// Test Zod schemas used in inventory actions

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

const saveCountSchema = z.object({
  ingredientId: z.string().min(1),
  quantity: z.number().int().min(0),
  expectedUpdatedAt: z.string().optional(),
});

describe("updateIngredientConfigSchema", () => {
  it("accepts valid config with all fields", () => {
    const result = updateIngredientConfigSchema.safeParse({
      id: "ing123",
      costPerUnitInCents: 350,
      snapIncrement: 5,
      containerProfile: "case (6-pack)",
      category: "Dairy",
      lowStockThreshold: 10,
      unitsPerContainer: 12,
      isPinned: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts minimal config (id only)", () => {
    const result = updateIngredientConfigSchema.safeParse({ id: "ing123" });
    expect(result.success).toBe(true);
  });

  it("rejects empty id", () => {
    const result = updateIngredientConfigSchema.safeParse({ id: "" });
    expect(result.success).toBe(false);
  });

  it("rejects negative cost", () => {
    const result = updateIngredientConfigSchema.safeParse({
      id: "ing123",
      costPerUnitInCents: -1,
    });
    expect(result.success).toBe(false);
  });

  it("accepts null values for optional fields", () => {
    const result = updateIngredientConfigSchema.safeParse({
      id: "ing123",
      costPerUnitInCents: null,
      snapIncrement: null,
      containerProfile: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects container profile over 100 chars", () => {
    const result = updateIngredientConfigSchema.safeParse({
      id: "ing123",
      containerProfile: "x".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("rejects category over 50 chars", () => {
    const result = updateIngredientConfigSchema.safeParse({
      id: "ing123",
      category: "x".repeat(51),
    });
    expect(result.success).toBe(false);
  });
});

describe("saveCountSchema", () => {
  it("accepts valid count", () => {
    const result = saveCountSchema.safeParse({
      ingredientId: "ing123",
      quantity: 50,
    });
    expect(result.success).toBe(true);
  });

  it("accepts count with expectedUpdatedAt", () => {
    const result = saveCountSchema.safeParse({
      ingredientId: "ing123",
      quantity: 50,
      expectedUpdatedAt: "2024-01-01T00:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts zero quantity", () => {
    const result = saveCountSchema.safeParse({
      ingredientId: "ing123",
      quantity: 0,
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative quantity", () => {
    const result = saveCountSchema.safeParse({
      ingredientId: "ing123",
      quantity: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer quantity", () => {
    const result = saveCountSchema.safeParse({
      ingredientId: "ing123",
      quantity: 1.5,
    });
    expect(result.success).toBe(false);
  });
});

describe("createIngredientPurchaseSchema", () => {
  it("accepts a valid purchase", () => {
    const result = createIngredientPurchaseSchema.safeParse({
      ingredientSupplierId: "link123",
      quantity: 10,
      unit: "kg",
      totalPriceInCents: 12500,
    });
    expect(result.success).toBe(true);
  });

  it("accepts zero total price", () => {
    const result = createIngredientPurchaseSchema.safeParse({
      ingredientSupplierId: "link123",
      quantity: 1,
      unit: "kg",
      totalPriceInCents: 0,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty ingredientSupplierId", () => {
    const result = createIngredientPurchaseSchema.safeParse({
      ingredientSupplierId: "",
      quantity: 10,
      unit: "kg",
      totalPriceInCents: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero quantity", () => {
    const result = createIngredientPurchaseSchema.safeParse({
      ingredientSupplierId: "link123",
      quantity: 0,
      unit: "kg",
      totalPriceInCents: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative quantity", () => {
    const result = createIngredientPurchaseSchema.safeParse({
      ingredientSupplierId: "link123",
      quantity: -1,
      unit: "kg",
      totalPriceInCents: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty unit", () => {
    const result = createIngredientPurchaseSchema.safeParse({
      ingredientSupplierId: "link123",
      quantity: 5,
      unit: "",
      totalPriceInCents: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative totalPriceInCents", () => {
    const result = createIngredientPurchaseSchema.safeParse({
      ingredientSupplierId: "link123",
      quantity: 5,
      unit: "kg",
      totalPriceInCents: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe("updateIngredientConfigSchema (no supplierId)", () => {
  it("strips unknown supplierId silently", () => {
    const result = updateIngredientConfigSchema.safeParse({
      id: "ing123",
      // legacy clients may still pass this
      supplierId: "sup1",
    } as Record<string, unknown>);
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).supplierId).toBeUndefined();
    }
  });
});

describe("Large change detection", () => {
  it("detects >50% increase", () => {
    const previous = 100;
    const newVal = 160;
    const change = Math.abs(newVal - previous) / previous;
    expect(change > 0.5).toBe(true);
  });

  it("detects >50% decrease", () => {
    const previous = 100;
    const newVal = 40;
    const change = Math.abs(newVal - previous) / previous;
    expect(change > 0.5).toBe(true);
  });

  it("does not flag 50% change", () => {
    const previous = 100;
    const newVal = 50;
    const change = Math.abs(newVal - previous) / previous;
    expect(change > 0.5).toBe(false);
  });

  it("does not flag small change", () => {
    const previous = 100;
    const newVal = 95;
    const change = Math.abs(newVal - previous) / previous;
    expect(change > 0.5).toBe(false);
  });
});

// ─── bulkCreateIngredientPurchases ─────────────────────────

interface TxState {
  ingredientFindMany: ReturnType<typeof vi.fn>;
  linkFindMany: ReturnType<typeof vi.fn>;
  // `linkCreate` is retained as a regression guard — the inline-link-creation
  // path was removed, and tests assert it is never called.
  linkCreate: ReturnType<typeof vi.fn>;
  purchaseCreate: ReturnType<typeof vi.fn>;
  // Inventory-count auto-bump (purchase → today's count) helpers.
  countFindFirst: ReturnType<typeof vi.fn>;
  countUpsert: ReturnType<typeof vi.fn>;
}

function makeTxState(overrides: Partial<TxState> = {}): TxState {
  return {
    ingredientFindMany: vi.fn().mockResolvedValue([]),
    linkFindMany: vi.fn().mockResolvedValue([]),
    linkCreate: vi.fn(),
    purchaseCreate: vi.fn(),
    countFindFirst: vi.fn().mockResolvedValue(null),
    countUpsert: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

function bindTransaction(state: TxState) {
  vi.mocked(prisma.$transaction).mockImplementation((async (cb: unknown) => {
    if (typeof cb !== "function") return [];
    const tx = {
      ingredient: { findMany: state.ingredientFindMany },
      ingredientSupplier: {
        findMany: state.linkFindMany,
        create: state.linkCreate,
      },
      ingredientPurchase: { create: state.purchaseCreate },
      inventoryCount: {
        findFirst: state.countFindFirst,
        upsert: state.countUpsert,
      },
    };
    return await (cb as (tx: unknown) => Promise<unknown>)(tx);
  }) as never);
  // Mirror the txn-side ingredient mock to the prisma-level mock used by
  // bulk pre-validation (which calls `prisma.ingredient.findMany` BEFORE
  // opening the transaction). Tests that don't supply unit data here will
  // hit the new fail-fast in pre-validation; the mock backfills `unit: "kg"`
  // as a sane default since most tests use kg purchases.
  vi.mocked(prisma.ingredient.findMany).mockImplementation(async () => {
    const rows = (await state.ingredientFindMany()) as Array<{
      id: string;
      name?: string;
      unit?: string;
    }>;
    return rows.map((r) => ({ ...r, unit: r.unit ?? "kg" })) as never;
  });
}

describe("bulkCreateIngredientPurchases", () => {
  it("happy path: creates N purchases for all-linked lines in one transaction", async () => {
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue({ id: "sup1" } as never);
    const state = makeTxState({
      ingredientFindMany: vi.fn().mockResolvedValue([
        { id: "ing1", name: "Milk" },
        { id: "ing2", name: "Sugar" },
      ]),
      linkFindMany: vi.fn().mockResolvedValue([
        { id: "link1", ingredientId: "ing1", supplierId: "sup1", cafeId: "cafe-1" },
        { id: "link2", ingredientId: "ing2", supplierId: "sup1", cafeId: "cafe-1" },
      ]),
      purchaseCreate: vi
        .fn()
        .mockResolvedValueOnce({ id: "pur1" })
        .mockResolvedValueOnce({ id: "pur2" }),
    });
    bindTransaction(state);

    const result = await bulkCreateIngredientPurchases({
      supplierId: "sup1",
      lines: [
        {
          ingredientId: "ing1",
          ingredientSupplierId: "link1",
          quantity: 2,
          unit: "kg",
          totalPriceInCents: 1000,
        },
        {
          ingredientId: "ing2",
          ingredientSupplierId: "link2",
          quantity: 5,
          unit: "kg",
          totalPriceInCents: 2500,
        },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.ids).toEqual(["pur1", "pur2"]);
    expect(state.purchaseCreate).toHaveBeenCalledTimes(2);
    expect(state.linkCreate).not.toHaveBeenCalled();
    // Cafe + creator derived server-side
    expect(state.purchaseCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cafeId: "cafe-1",
          createdById: "user-1",
        }),
      })
    );
    // FIFO groundwork: each created lot starts with remainingQuantity = quantity
    expect(state.purchaseCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ quantity: 2, remainingQuantity: 2 }),
      })
    );
    expect(state.purchaseCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ quantity: 5, remainingQuantity: 5 }),
      })
    );
  });

  it("rejects line missing ingredientSupplierId via zod", async () => {
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue({ id: "sup1" } as never);
    const state = makeTxState();
    bindTransaction(state);

    const result = await bulkCreateIngredientPurchases({
      supplierId: "sup1",
      lines: [
        // @ts-expect-error — intentionally omitting ingredientSupplierId to verify zod rejection
        {
          ingredientId: "ing1",
          quantity: 1,
          unit: "kg",
          totalPriceInCents: 1000,
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects stale ingredientSupplierId returning 'Ingredient supplier link not found'", async () => {
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue({ id: "sup1" } as never);
    const state = makeTxState({
      ingredientFindMany: vi.fn().mockResolvedValue([{ id: "ing1", name: "Milk" }]),
      linkFindMany: vi.fn().mockResolvedValue([]), // link removed mid-session
      purchaseCreate: vi.fn(),
    });
    bindTransaction(state);

    const result = await bulkCreateIngredientPurchases({
      supplierId: "sup1",
      lines: [
        {
          ingredientId: "ing1",
          ingredientSupplierId: "stale-link",
          quantity: 1,
          unit: "kg",
          totalPriceInCents: 1000,
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("Ingredient supplier link not found");
    expect(state.purchaseCreate).not.toHaveBeenCalled();
  });

  it("ignores extra priceInCents on a line and never creates a link", async () => {
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue({ id: "sup1" } as never);
    const state = makeTxState({
      ingredientFindMany: vi.fn().mockResolvedValue([{ id: "ing1", name: "Milk" }]),
      linkFindMany: vi.fn().mockResolvedValue([
        { id: "link1", ingredientId: "ing1", supplierId: "sup1", cafeId: "cafe-1" },
      ]),
      purchaseCreate: vi.fn().mockResolvedValue({ id: "pur1" }),
    });
    bindTransaction(state);

    const result = await bulkCreateIngredientPurchases({
      supplierId: "sup1",
      lines: [
        {
          ingredientId: "ing1",
          ingredientSupplierId: "link1",
          quantity: 1,
          unit: "kg",
          totalPriceInCents: 500,
          // @ts-expect-error — extra field that should be stripped/ignored
          priceInCents: 9999,
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(state.linkCreate).not.toHaveBeenCalled();
  });

  it("stores override total exactly as provided", async () => {
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue({ id: "sup1" } as never);
    const state = makeTxState({
      ingredientFindMany: vi.fn().mockResolvedValue([{ id: "ing1", name: "Milk" }]),
      linkFindMany: vi.fn().mockResolvedValue([
        { id: "link1", ingredientId: "ing1", supplierId: "sup1", cafeId: "cafe-1" },
      ]),
      purchaseCreate: vi.fn().mockResolvedValue({ id: "pur1" }),
    });
    bindTransaction(state);

    const result = await bulkCreateIngredientPurchases({
      supplierId: "sup1",
      lines: [
        {
          ingredientId: "ing1",
          ingredientSupplierId: "link1",
          quantity: 2,
          unit: "kg",
          totalPriceInCents: 9999, // override that doesn't equal qty * unit price
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(state.purchaseCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ totalPriceInCents: 9999 }),
      })
    );
  });

  it("rejects duplicate ingredient lines before any DB write", async () => {
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue({ id: "sup1" } as never);
    const state = makeTxState();
    bindTransaction(state);

    const result = await bulkCreateIngredientPurchases({
      supplierId: "sup1",
      lines: [
        {
          ingredientId: "ing1",
          ingredientSupplierId: "link1",
          quantity: 1,
          unit: "kg",
          totalPriceInCents: 100,
        },
        {
          ingredientId: "ing1",
          ingredientSupplierId: "link1",
          quantity: 1,
          unit: "kg",
          totalPriceInCents: 100,
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/[Dd]uplicate/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects supplier from another cafe", async () => {
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue(null);
    const state = makeTxState();
    bindTransaction(state);

    const result = await bulkCreateIngredientPurchases({
      supplierId: "supX",
      lines: [
        {
          ingredientId: "ing1",
          ingredientSupplierId: "link1",
          quantity: 1,
          unit: "kg",
          totalPriceInCents: 100,
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("Supplier not found");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects ingredient from another cafe", async () => {
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue({ id: "sup1" } as never);
    const state = makeTxState({
      // ingredient findMany returns nothing (cafe-scoped query won't match)
      ingredientFindMany: vi.fn().mockResolvedValue([]),
    });
    bindTransaction(state);

    const result = await bulkCreateIngredientPurchases({
      supplierId: "sup1",
      lines: [
        {
          ingredientId: "ingFromOtherCafe",
          ingredientSupplierId: "link1",
          quantity: 1,
          unit: "kg",
          totalPriceInCents: 100,
        },
      ],
    });

    expect(result.success).toBe(false);
    // Fail-fast in pre-validation surfaces the specific line + ingredient id
    // rather than the generic "Ingredient not found" thrown inside the txn.
    if (!result.success) expect(result.error).toMatch(/not found in this cafe/);
  });

  it("rejects empty lines via zod", async () => {
    const result = await bulkCreateIngredientPurchases({
      supplierId: "sup1",
      lines: [],
    });
    expect(result.success).toBe(false);
    expect(prisma.supplier.findFirst).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated callers", async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error("Unauthorized"));
    const result = await bulkCreateIngredientPurchases({
      supplierId: "sup1",
      lines: [
        {
          ingredientId: "ing1",
          ingredientSupplierId: "link1",
          quantity: 1,
          unit: "kg",
          totalPriceInCents: 100,
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("Unauthorized");
  });

  it("rejects invalid quantity via zod", async () => {
    const result = await bulkCreateIngredientPurchases({
      supplierId: "sup1",
      lines: [
        {
          ingredientId: "ing1",
          ingredientSupplierId: "link1",
          quantity: 0,
          unit: "kg",
          totalPriceInCents: 100,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rolls back all rows when one line fails mid-transaction", async () => {
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue({ id: "sup1" } as never);
    const state = makeTxState({
      ingredientFindMany: vi.fn().mockResolvedValue([
        { id: "ing1", name: "Milk" },
        { id: "ing2", name: "Sugar" },
      ]),
      linkFindMany: vi.fn().mockResolvedValue([
        { id: "link1", ingredientId: "ing1", supplierId: "sup1", cafeId: "cafe-1" },
        { id: "link2", ingredientId: "ing2", supplierId: "sup1", cafeId: "cafe-1" },
      ]),
      // First create succeeds, second fails — emulate transaction abort
      purchaseCreate: vi
        .fn()
        .mockResolvedValueOnce({ id: "pur1" })
        .mockRejectedValueOnce(new Error("DB error on second insert")),
    });

    // Make $transaction throw if its callback throws (so caller sees failure)
    vi.mocked(prisma.$transaction).mockImplementation((async (cb: unknown) => {
      if (typeof cb !== "function") return [];
      const tx = {
        ingredient: { findMany: state.ingredientFindMany },
        ingredientSupplier: {
          findMany: state.linkFindMany,
          create: state.linkCreate,
        },
        ingredientPurchase: { create: state.purchaseCreate },
        inventoryCount: {
          findFirst: state.countFindFirst,
          upsert: state.countUpsert,
        },
      };
      // If callback throws, propagate (real prisma rollback semantics)
      return await (cb as (tx: unknown) => Promise<unknown>)(tx);
    }) as never);

    const result = await bulkCreateIngredientPurchases({
      supplierId: "sup1",
      lines: [
        {
          ingredientId: "ing1",
          ingredientSupplierId: "link1",
          quantity: 1,
          unit: "kg",
          totalPriceInCents: 100,
        },
        {
          ingredientId: "ing2",
          ingredientSupplierId: "link2",
          quantity: 1,
          unit: "kg",
          totalPriceInCents: 200,
        },
      ],
    });

    expect(result.success).toBe(false);
    // Action should not return success ids when any line errored
    if (result.success === false) expect(result.error).toBeTruthy();
    expect(state.linkCreate).not.toHaveBeenCalled();
  });

  // ─── Auto-bump today's InventoryCount inside the purchase txn ────

  it("creates today's InventoryCount seeded from purchase quantity when no prior count exists", async () => {
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue({ id: "sup1" } as never);
    const state = makeTxState({
      ingredientFindMany: vi.fn().mockResolvedValue([{ id: "ing1", name: "Coffee" }]),
      linkFindMany: vi.fn().mockResolvedValue([
        { id: "link1", ingredientId: "ing1", supplierId: "sup1", cafeId: "cafe-1" },
      ]),
      purchaseCreate: vi.fn().mockResolvedValue({ id: "pur1" }),
      // No prior count — first count of the day for this ingredient.
      countFindFirst: vi.fn().mockResolvedValue(null),
    });
    bindTransaction(state);

    const result = await bulkCreateIngredientPurchases({
      supplierId: "sup1",
      lines: [
        {
          ingredientId: "ing1",
          ingredientSupplierId: "link1",
          quantity: 100,
          unit: "kg",
          totalPriceInCents: 50000,
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(state.countUpsert).toHaveBeenCalledTimes(1);
    expect(state.countUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          ingredientId: "ing1",
          cafeId: "cafe-1",
          quantity: 100,
          confirmedById: "user-1",
        }),
        update: expect.objectContaining({
          quantity: { increment: 100 },
        }),
      })
    );
    // countDate must be UTC midnight (the canonical `@db.Date` shape) so it
    // matches the key the inventory page (and other readers) use. Server-local
    // midnight on a +tz host would shift to the previous UTC date and the
    // bumped count would be invisible to the UI.
    const upsertArg = state.countUpsert.mock.calls[0]![0] as {
      where: { ingredientId_countDate: { countDate: Date } };
    };
    const countDate = upsertArg.where.ingredientId_countDate.countDate;
    expect(countDate).toBeInstanceOf(Date);
    expect(countDate.getUTCHours()).toBe(0);
    expect(countDate.getUTCMinutes()).toBe(0);
    expect(countDate.getUTCSeconds()).toBe(0);
    expect(countDate.getUTCMilliseconds()).toBe(0);
  });

  it("seeds today's count from yesterday's quantity when no count exists today", async () => {
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue({ id: "sup1" } as never);
    const state = makeTxState({
      ingredientFindMany: vi.fn().mockResolvedValue([{ id: "ing1", name: "Coffee" }]),
      linkFindMany: vi.fn().mockResolvedValue([
        { id: "link1", ingredientId: "ing1", supplierId: "sup1", cafeId: "cafe-1" },
      ]),
      purchaseCreate: vi.fn().mockResolvedValue({ id: "pur1" }),
      // Prior-day count = 50; today has none yet.
      countFindFirst: vi.fn().mockResolvedValue({ quantity: 50 }),
    });
    bindTransaction(state);

    const result = await bulkCreateIngredientPurchases({
      supplierId: "sup1",
      lines: [
        {
          ingredientId: "ing1",
          ingredientSupplierId: "link1",
          quantity: 100,
          unit: "kg",
          totalPriceInCents: 50000,
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(state.countUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          quantity: 150, // 50 (yesterday) + 100 (purchase)
          confirmedById: "user-1",
        }),
      })
    );
  });

  it("increments today's count when one exists; does not touch confirmedById", async () => {
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue({ id: "sup1" } as never);
    const state = makeTxState({
      ingredientFindMany: vi.fn().mockResolvedValue([{ id: "ing1", name: "Coffee" }]),
      linkFindMany: vi.fn().mockResolvedValue([
        { id: "link1", ingredientId: "ing1", supplierId: "sup1", cafeId: "cafe-1" },
      ]),
      purchaseCreate: vi.fn().mockResolvedValue({ id: "pur1" }),
      // findFirst is for prior-day count; today's count is implicit in the
      // upsert.update branch — Prisma's upsert handles which branch runs.
      countFindFirst: vi.fn().mockResolvedValue({ quantity: 200 }),
    });
    bindTransaction(state);

    const result = await bulkCreateIngredientPurchases({
      supplierId: "sup1",
      lines: [
        {
          ingredientId: "ing1",
          ingredientSupplierId: "link1",
          quantity: 50,
          unit: "kg",
          totalPriceInCents: 25000,
        },
      ],
    });

    expect(result.success).toBe(true);
    const upsertArg = state.countUpsert.mock.calls[0]![0] as {
      update: Record<string, unknown>;
    };
    // Update branch increments; never resets confirmedById/confirmedAt.
    expect(upsertArg.update).toEqual({ quantity: { increment: 50 } });
    expect(upsertArg.update.confirmedById).toBeUndefined();
    expect(upsertArg.update.confirmedAt).toBeUndefined();
  });
});

// ─── createIngredientPurchase (single-line auto-bump) ──────

describe("createIngredientPurchase", () => {
  it("creates today's InventoryCount seeded from purchase quantity when no prior count exists", async () => {
    vi.mocked(prisma.ingredientSupplier.findFirst).mockResolvedValue({
      id: "link1",
      ingredientId: "ing1",
      supplierId: "sup1",
      cafeId: "cafe-1",
      // Storage unit matches the purchase unit so convert() is identity (100 → 100).
      ingredient: { unit: "kg" },
    } as never);

    const countFindFirst = vi.fn().mockResolvedValue(null);
    const countUpsert = vi.fn().mockResolvedValue({});
    const purchaseCreate = vi.fn().mockResolvedValue({ id: "pur1" });

    vi.mocked(prisma.$transaction).mockImplementation((async (cb: unknown) => {
      if (typeof cb !== "function") return undefined;
      const tx = {
        ingredientPurchase: { create: purchaseCreate },
        inventoryCount: {
          findFirst: countFindFirst,
          upsert: countUpsert,
        },
      };
      return await (cb as (tx: unknown) => Promise<unknown>)(tx);
    }) as never);

    const result = await createIngredientPurchase({
      ingredientSupplierId: "link1",
      quantity: 100,
      unit: "kg",
      totalPriceInCents: 5000,
    });

    expect(result.success).toBe(true);
    expect(purchaseCreate).toHaveBeenCalledTimes(1);
    expect(purchaseCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ingredientSupplierId: "link1",
          cafeId: "cafe-1",
          createdById: "user-1",
          quantity: 100,
          remainingQuantity: 100,
          unit: "kg",
          totalPriceInCents: 5000,
        }),
      })
    );
    expect(countUpsert).toHaveBeenCalledTimes(1);
    expect(countUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          ingredientId: "ing1",
          cafeId: "cafe-1",
          quantity: 100,
          confirmedById: "user-1",
        }),
        update: expect.objectContaining({
          quantity: { increment: 100 },
        }),
      })
    );
    // Same convention as bulk path: countDate must be UTC midnight.
    const upsertArg = countUpsert.mock.calls[0]![0] as {
      where: { ingredientId_countDate: { countDate: Date } };
    };
    const countDate = upsertArg.where.ingredientId_countDate.countDate;
    expect(countDate).toBeInstanceOf(Date);
    expect(countDate.getUTCHours()).toBe(0);
    expect(countDate.getUTCMinutes()).toBe(0);
    expect(countDate.getUTCSeconds()).toBe(0);
    expect(countDate.getUTCMilliseconds()).toBe(0);
  });

  // ─── Unit conversion to ingredient storage unit ──────────

  it("converts purchase quantity to storage unit (1 kg → 1000 g) and bumps inventory by converted value", async () => {
    // Ingredient stored in `g`; user logs 1 kg. Expected: purchase row uses
    // converted quantity (1000) and storage unit (g); InventoryCount += 1000.
    vi.mocked(prisma.ingredientSupplier.findFirst).mockResolvedValue({
      id: "link1",
      ingredientId: "ing1",
      supplierId: "sup1",
      cafeId: "cafe-1",
      ingredient: { unit: "g" },
    } as never);

    const countFindFirst = vi.fn().mockResolvedValue(null);
    const countUpsert = vi.fn().mockResolvedValue({});
    const purchaseCreate = vi.fn().mockResolvedValue({ id: "pur1" });

    vi.mocked(prisma.$transaction).mockImplementation((async (cb: unknown) => {
      if (typeof cb !== "function") return undefined;
      const tx = {
        ingredientPurchase: { create: purchaseCreate },
        inventoryCount: { findFirst: countFindFirst, upsert: countUpsert },
      };
      return await (cb as (tx: unknown) => Promise<unknown>)(tx);
    }) as never);

    const result = await createIngredientPurchase({
      ingredientSupplierId: "link1",
      quantity: 1,
      unit: "kg",
      totalPriceInCents: 1500,
    });

    expect(result.success).toBe(true);
    expect(purchaseCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ingredientSupplierId: "link1",
          cafeId: "cafe-1",
          createdById: "user-1",
          quantity: 1000,
          remainingQuantity: 1000,
          unit: "g",
          totalPriceInCents: 1500,
        }),
      })
    );
    // InventoryCount upsert uses the converted value, not the raw 1.
    expect(countUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ quantity: 1000 }),
        update: expect.objectContaining({ quantity: { increment: 1000 } }),
      })
    );
  });

  it("same-unit purchase (2 each → ingredient stored in each) saves quantity unchanged", async () => {
    // convert() is identity when from === to; assert no spurious arithmetic.
    vi.mocked(prisma.ingredientSupplier.findFirst).mockResolvedValue({
      id: "link1",
      ingredientId: "ing1",
      supplierId: "sup1",
      cafeId: "cafe-1",
      ingredient: { unit: "each" },
    } as never);

    const purchaseCreate = vi.fn().mockResolvedValue({ id: "pur1" });
    vi.mocked(prisma.$transaction).mockImplementation((async (cb: unknown) => {
      if (typeof cb !== "function") return undefined;
      const tx = {
        ingredientPurchase: { create: purchaseCreate },
        inventoryCount: {
          findFirst: vi.fn().mockResolvedValue(null),
          upsert: vi.fn().mockResolvedValue({}),
        },
      };
      return await (cb as (tx: unknown) => Promise<unknown>)(tx);
    }) as never);

    const result = await createIngredientPurchase({
      ingredientSupplierId: "link1",
      quantity: 2,
      unit: "each",
      totalPriceInCents: 100,
    });

    expect(result.success).toBe(true);
    expect(purchaseCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quantity: 2,
          remainingQuantity: 2,
          unit: "each",
        }),
      })
    );
  });
});

// ─── bulkCreateIngredientPurchases — convert ──────────────

describe("bulkCreateIngredientPurchases convert pre-validation", () => {
  it("rejects whole txn when one line is cross-dimension (kg into mL ingredient)", async () => {
    // 5 lines; line 3 is the cross-dimension one. The action must return
    // {success:false} and never open the transaction (no DB writes).
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue({ id: "sup1" } as never);
    // Pre-fetch returns storage units for all 5 ingredients. Line 3's
    // ingredient stores in mL; the user is trying to log 1 kg.
    vi.mocked(prisma.ingredient.findMany).mockResolvedValue([
      { id: "ing1", unit: "g" },
      { id: "ing2", unit: "g" },
      { id: "ing3", unit: "mL" }, // mismatched dimension vs `kg`
      { id: "ing4", unit: "g" },
      { id: "ing5", unit: "g" },
    ] as never);

    const result = await bulkCreateIngredientPurchases({
      supplierId: "sup1",
      lines: [
        { ingredientId: "ing1", ingredientSupplierId: "link1", quantity: 1, unit: "kg", totalPriceInCents: 100 },
        { ingredientId: "ing2", ingredientSupplierId: "link2", quantity: 1, unit: "kg", totalPriceInCents: 100 },
        { ingredientId: "ing3", ingredientSupplierId: "link3", quantity: 1, unit: "kg", totalPriceInCents: 100 },
        { ingredientId: "ing4", ingredientSupplierId: "link4", quantity: 1, unit: "kg", totalPriceInCents: 100 },
        { ingredientId: "ing5", ingredientSupplierId: "link5", quantity: 1, unit: "kg", totalPriceInCents: 100 },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      // Error message names the failing line and ingredient id.
      expect(result.error).toMatch(/Line 3/);
      expect(result.error).toMatch(/ing3/);
    }
    // Critical: transaction is NEVER opened on conversion failure.
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("InventoryCount upsert uses converted value (1 L → 1000 mL), not raw", async () => {
    // Bulk path; ingredient stored in mL; user logs 1 L → expect 1000 mL bump.
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue({ id: "sup1" } as never);

    // The unit lives in the txn-state mock — bindTransaction mirrors it
    // into the prisma-level mock that pre-validation reads from.
    const state = makeTxState({
      ingredientFindMany: vi.fn().mockResolvedValue([{ id: "ingMilk", name: "Oat Milk", unit: "mL" }]),
      linkFindMany: vi.fn().mockResolvedValue([
        { id: "linkMilk", ingredientId: "ingMilk", supplierId: "sup1", cafeId: "cafe-1" },
      ]),
      purchaseCreate: vi.fn().mockResolvedValue({ id: "pur1" }),
      countFindFirst: vi.fn().mockResolvedValue(null),
    });
    bindTransaction(state);

    const result = await bulkCreateIngredientPurchases({
      supplierId: "sup1",
      lines: [
        {
          ingredientId: "ingMilk",
          ingredientSupplierId: "linkMilk",
          quantity: 1,
          unit: "L",
          totalPriceInCents: 600,
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(state.purchaseCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quantity: 1000,
          remainingQuantity: 1000,
          unit: "mL",
        }),
      })
    );
    expect(state.countUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ quantity: 1000 }),
        update: expect.objectContaining({ quantity: { increment: 1000 } }),
      })
    );
  });
});

// ─── setManualCostOverride (Spec B1) ───────────────────────

describe("setManualCostOverride", () => {
  it("rejects when ingredient does not exist for this cafe", async () => {
    vi.mocked(prisma.ingredient.findFirst).mockResolvedValue(null);

    const result = await setManualCostOverride("missing", false);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("Ingredient not found");
    expect(prisma.ingredient.update).not.toHaveBeenCalled();
  });

  it("flips override to false without changing cost", async () => {
    vi.mocked(prisma.ingredient.findFirst).mockResolvedValue({
      id: "ing-1",
    } as never);
    vi.mocked(prisma.ingredient.update).mockResolvedValue({} as never);

    const result = await setManualCostOverride("ing-1", false);

    expect(result.success).toBe(true);
    expect(prisma.ingredient.update).toHaveBeenCalledWith({
      where: { id: "ing-1" },
      data: { manualCostOverride: false },
    });
  });

  it("locks (override = true) and writes new cost when value provided", async () => {
    vi.mocked(prisma.ingredient.findFirst).mockResolvedValue({
      id: "ing-1",
    } as never);
    vi.mocked(prisma.ingredient.update).mockResolvedValue({} as never);

    const result = await setManualCostOverride("ing-1", true, 450);

    expect(result.success).toBe(true);
    expect(prisma.ingredient.update).toHaveBeenCalledWith({
      where: { id: "ing-1" },
      data: { manualCostOverride: true, costPerUnitInCents: 450 },
    });
  });

  it("locks without changing cost when value is omitted", async () => {
    vi.mocked(prisma.ingredient.findFirst).mockResolvedValue({
      id: "ing-1",
    } as never);
    vi.mocked(prisma.ingredient.update).mockResolvedValue({} as never);

    const result = await setManualCostOverride("ing-1", true);

    expect(result.success).toBe(true);
    expect(prisma.ingredient.update).toHaveBeenCalledWith({
      where: { id: "ing-1" },
      data: { manualCostOverride: true },
    });
  });

  it("rejects negative cost", async () => {
    vi.mocked(prisma.ingredient.findFirst).mockResolvedValue({
      id: "ing-1",
    } as never);

    const result = await setManualCostOverride("ing-1", true, -1);

    expect(result.success).toBe(false);
    // Zod's min(0) message — the action now validates via the schema.
    if (!result.success) expect(result.error).toMatch(/>=\s*0|greater than or equal to 0/i);
    expect(prisma.ingredient.update).not.toHaveBeenCalled();
  });

  it("returns Unauthorized when role check fails", async () => {
    vi.mocked(requireRole).mockRejectedValueOnce(new Error("Unauthorized"));

    const result = await setManualCostOverride("ing-1", false);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("Unauthorized");
  });

  it("rejects values above the schema's upper bound (1e15)", async () => {
    vi.mocked(prisma.ingredient.findFirst).mockResolvedValue({
      id: "ing-1",
    } as never);

    const result = await setManualCostOverride("ing-1", true, 1e15);

    expect(result.success).toBe(false);
    if (!result.success) {
      // Zod's max(...) message — exact wording varies by version, just assert it's the bound error
      expect(result.error).toMatch(/<=|less than or equal to/i);
    }
    expect(prisma.ingredient.update).not.toHaveBeenCalled();
  });

  it("rejects passing a numeric value while unlocking (override = false)", async () => {
    vi.mocked(prisma.ingredient.findFirst).mockResolvedValue({
      id: "ing-1",
    } as never);

    const result = await setManualCostOverride("ing-1", false, 100);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Cannot set cost while unlocking");
    }
    expect(prisma.ingredient.update).not.toHaveBeenCalled();
  });

  it("clears cost atomically when called with (id, true, null)", async () => {
    vi.mocked(prisma.ingredient.findFirst).mockResolvedValue({
      id: "ing-1",
    } as never);
    vi.mocked(prisma.ingredient.update).mockResolvedValue({} as never);

    const result = await setManualCostOverride("ing-1", true, null);

    expect(result.success).toBe(true);
    expect(prisma.ingredient.update).toHaveBeenCalledWith({
      where: { id: "ing-1" },
      data: { manualCostOverride: true, costPerUnitInCents: null },
    });
  });
});

// ─── Purchase History & Invoice Attach ─────────────────────

describe("getPurchaseHistory", () => {
  function purchaseRow(over: Record<string, unknown> = {}) {
    return {
      id: "p1",
      cafeId: "cafe-1",
      quantity: 2,
      unit: "kg",
      totalPriceInCents: dec(500),
      invoiceImageUrl: null,
      createdById: "user-1",
      createdAt: new Date("2026-04-29T10:30:15Z"),
      createdBy: { name: "Alice" },
      ingredientSupplier: {
        supplierId: "sup-A",
        supplier: { name: "Acme" },
        ingredient: { id: "ing-1", name: "Coffee" },
      },
      ...over,
    };
  }

  it("groups same-minute lines into one receipt and returns them newest-first", async () => {
    vi.mocked(prisma.ingredientPurchase.findMany).mockResolvedValue([
      purchaseRow({ id: "p1", createdAt: new Date("2026-04-29T10:30:00Z") }),
      purchaseRow({ id: "p2", createdAt: new Date("2026-04-29T10:30:30Z") }),
      purchaseRow({ id: "p3", createdAt: new Date("2026-04-29T11:00:00Z") }),
    ] as never);

    const result = await getPurchaseHistory();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.receipts.length).toBe(2);
    // Newest receipt first (11:00) then 10:30 with 2 lines
    expect(result.data.receipts[0]!.lines.length).toBe(1);
    expect(result.data.receipts[1]!.lines.length).toBe(2);
    expect(result.data.totalReceipts).toBe(2);
    expect(result.data.page).toBe(0);
  });

  it("returns empty receipts list when no purchases in range", async () => {
    vi.mocked(prisma.ingredientPurchase.findMany).mockResolvedValue([] as never);
    const result = await getPurchaseHistory();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.receipts).toEqual([]);
    expect(result.data.totalReceipts).toBe(0);
  });

  it("clamps requested page beyond last to the last valid page", async () => {
    // 30 receipts (each in distinct minute) → 2 pages of 25 (page 0 has 25, page 1 has 5)
    const rows = Array.from({ length: 30 }, (_, i) =>
      purchaseRow({
        id: `p${i}`,
        // Distinct minutes — ensures each row becomes its own receipt.
        createdAt: new Date(2026, 3, 29, 10, i, 0),
      })
    );
    vi.mocked(prisma.ingredientPurchase.findMany).mockResolvedValue(rows as never);

    const result = await getPurchaseHistory({ page: 999 });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.page).toBe(1);
    expect(result.data.receipts.length).toBe(5);
  });

  it("scopes findMany by cafeId and the 90-day window", async () => {
    vi.mocked(prisma.ingredientPurchase.findMany).mockResolvedValue([] as never);
    await getPurchaseHistory();
    const call = vi.mocked(prisma.ingredientPurchase.findMany).mock.calls[0]![0]!;
    const where = (call as { where: { cafeId: string; createdAt: { gte: Date } } }).where;
    expect(where.cafeId).toBe("cafe-1");
    expect(where.createdAt.gte).toBeInstanceOf(Date);
    // gte should be ≈ 90 days ago — within 1 second of now-90d
    const expected = Date.now() - 90 * 24 * 60 * 60 * 1000;
    expect(Math.abs(where.createdAt.gte.getTime() - expected)).toBeLessThan(1000);
  });

  it("returns Unauthorized when not signed in", async () => {
    vi.mocked(requireAuth).mockRejectedValueOnce(new Error("Unauthorized"));
    const result = await getPurchaseHistory();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("Unauthorized");
  });
});

describe("attachPurchaseInvoice", () => {
  const validKey = "sup-A|user-1|2026-04-29T10:30:00.000Z";
  const validImage = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAA";

  it("writes invoiceImageUrl to all matching rows in the batch window", async () => {
    vi.mocked(prisma.ingredientPurchase.updateMany).mockResolvedValue({ count: 3 } as never);

    const result = await attachPurchaseInvoice({
      batchKey: validKey,
      imageDataUrl: validImage,
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.updatedCount).toBe(3);
    const arg = vi.mocked(prisma.ingredientPurchase.updateMany).mock.calls[0]![0]!;
    const typed = arg as {
      where: {
        cafeId: string;
        createdById: string;
        ingredientSupplier: { supplierId: string };
        createdAt: { gte: Date; lt: Date };
      };
      data: { invoiceImageUrl: string };
    };
    expect(typed.where.cafeId).toBe("cafe-1");
    expect(typed.where.createdById).toBe("user-1");
    expect(typed.where.ingredientSupplier.supplierId).toBe("sup-A");
    expect(typed.where.createdAt.gte.toISOString()).toBe("2026-04-29T10:30:00.000Z");
    expect(typed.where.createdAt.lt.toISOString()).toBe("2026-04-29T10:31:00.000Z");
    expect(typed.data.invoiceImageUrl).toBe(validImage);
  });

  it("rejects STAFF role with Unauthorized (does not call updateMany)", async () => {
    vi.mocked(requireRole).mockRejectedValueOnce(new Error("Unauthorized"));
    const result = await attachPurchaseInvoice({
      batchKey: validKey,
      imageDataUrl: validImage,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("Unauthorized");
    expect(prisma.ingredientPurchase.updateMany).not.toHaveBeenCalled();
  });

  it("returns Receipt not found when zero rows match (e.g. cross-cafe injection attempt)", async () => {
    vi.mocked(prisma.ingredientPurchase.updateMany).mockResolvedValue({ count: 0 } as never);
    const result = await attachPurchaseInvoice({
      batchKey: validKey,
      imageDataUrl: validImage,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("Receipt not found");
  });

  it("rejects malformed batchKey before hitting the database", async () => {
    const result = await attachPurchaseInvoice({
      batchKey: "not-a-valid-key",
      imageDataUrl: validImage,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("Invalid receipt reference");
    expect(prisma.ingredientPurchase.updateMany).not.toHaveBeenCalled();
  });

  it("rejects non-image data URL via zod regex", async () => {
    const result = await attachPurchaseInvoice({
      batchKey: validKey,
      imageDataUrl: "data:text/html;base64,abc",
    });
    expect(result.success).toBe(false);
    expect(prisma.ingredientPurchase.updateMany).not.toHaveBeenCalled();
  });

  it("rejects oversized image (> 3MB base64)", async () => {
    const huge = "data:image/jpeg;base64," + "A".repeat(3_000_001);
    const result = await attachPurchaseInvoice({
      batchKey: validKey,
      imageDataUrl: huge,
    });
    expect(result.success).toBe(false);
    expect(prisma.ingredientPurchase.updateMany).not.toHaveBeenCalled();
  });
});

describe("detachPurchaseInvoice", () => {
  const validKey = "sup-A|user-1|2026-04-29T10:30:00.000Z";

  it("sets invoiceImageUrl to null on all rows in the batch", async () => {
    vi.mocked(prisma.ingredientPurchase.updateMany).mockResolvedValue({ count: 3 } as never);
    const result = await detachPurchaseInvoice({ batchKey: validKey });
    expect(result.success).toBe(true);
    const arg = vi.mocked(prisma.ingredientPurchase.updateMany).mock.calls[0]![0]!;
    expect((arg as { data: { invoiceImageUrl: null } }).data.invoiceImageUrl).toBeNull();
  });

  it("requires MANAGER role", async () => {
    vi.mocked(requireRole).mockRejectedValueOnce(new Error("Unauthorized"));
    const result = await detachPurchaseInvoice({ batchKey: validKey });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("Unauthorized");
  });

  it("returns Receipt not found when no rows match", async () => {
    vi.mocked(prisma.ingredientPurchase.updateMany).mockResolvedValue({ count: 0 } as never);
    const result = await detachPurchaseInvoice({ batchKey: validKey });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("Receipt not found");
  });
});

// ─── updateIngredientDisplayUnit ──────────────────────────

describe("updateIngredientDisplayUnit", () => {
  beforeEach(() => {
    // requireRole returns the manager session by default (set in the file's beforeEach).
  });

  it("happy path: persists L → mL on a volume ingredient", async () => {
    vi.mocked(prisma.ingredient.findFirst).mockResolvedValue({
      unit: "L",
    } as never);
    vi.mocked(prisma.ingredient.update).mockResolvedValue({} as never);

    const result = await updateIngredientDisplayUnit({
      ingredientId: "ing-milk",
      displayUnit: "mL",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.displayUnit).toBe("mL");
    expect(prisma.ingredient.update).toHaveBeenCalledWith({
      where: { id: "ing-milk" },
      data: { displayUnit: "mL" },
    });
  });

  it("clears the display unit when displayUnit is null", async () => {
    vi.mocked(prisma.ingredient.findFirst).mockResolvedValue({
      unit: "L",
    } as never);
    vi.mocked(prisma.ingredient.update).mockResolvedValue({} as never);

    const result = await updateIngredientDisplayUnit({
      ingredientId: "ing-milk",
      displayUnit: null,
    });

    expect(result.success).toBe(true);
    expect(prisma.ingredient.update).toHaveBeenCalledWith({
      where: { id: "ing-milk" },
      data: { displayUnit: null },
    });
  });

  it("rejects cross-dimension display unit (L → kg)", async () => {
    vi.mocked(prisma.ingredient.findFirst).mockResolvedValue({
      unit: "L",
    } as never);

    const result = await updateIngredientDisplayUnit({
      ingredientId: "ing-milk",
      displayUnit: "kg",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/same dimension/i);
    }
    expect(prisma.ingredient.update).not.toHaveBeenCalled();
  });

  it("rejects when ingredient.unit is a custom value (not in any dimension)", async () => {
    vi.mocked(prisma.ingredient.findFirst).mockResolvedValue({
      unit: "scoop",
    } as never);

    const result = await updateIngredientDisplayUnit({
      ingredientId: "ing-x",
      displayUnit: "mL",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/known convertible/i);
    }
    expect(prisma.ingredient.update).not.toHaveBeenCalled();
  });

  it("rejects when ingredient is not in the caller's cafe", async () => {
    vi.mocked(prisma.ingredient.findFirst).mockResolvedValue(null);

    const result = await updateIngredientDisplayUnit({
      ingredientId: "ing-other-cafe",
      displayUnit: "mL",
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("Ingredient not found");
    expect(prisma.ingredient.update).not.toHaveBeenCalled();
  });

  it("rejects STAFF caller (Unauthorized)", async () => {
    vi.mocked(requireRole).mockRejectedValueOnce(new Error("Unauthorized"));

    const result = await updateIngredientDisplayUnit({
      ingredientId: "ing-x",
      displayUnit: "mL",
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("Unauthorized");
    expect(prisma.ingredient.update).not.toHaveBeenCalled();
  });

  it("rejects empty / oversized displayUnit string via zod", async () => {
    expect(
      (await updateIngredientDisplayUnit({ ingredientId: "i", displayUnit: "" }))
        .success
    ).toBe(false);
    expect(
      (
        await updateIngredientDisplayUnit({
          ingredientId: "i",
          displayUnit: "a".repeat(21),
        })
      ).success
    ).toBe(false);
  });

  it("normalizes displayUnit === unit to null (no storage drift)", async () => {
    // Manager picks "L" as displayUnit on a unit=L ingredient — visually
    // identical to "(same as unit)". Persisting the literal value would let a
    // future unit change silently promote the duplicate into a stale conversion.
    vi.mocked(prisma.ingredient.findFirst).mockResolvedValue({
      unit: "L",
    } as never);
    vi.mocked(prisma.ingredient.update).mockResolvedValue({} as never);

    const result = await updateIngredientDisplayUnit({
      ingredientId: "ing-milk",
      displayUnit: "L", // identical to ingredient's unit
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.displayUnit).toBeNull();
    expect(prisma.ingredient.update).toHaveBeenCalledWith({
      where: { id: "ing-milk" },
      data: { displayUnit: null },
    });
  });
});

// ─── getInventoryLog ──────────────────────────────────────

describe("getInventoryLog", () => {
  it("returns merged + sorted page (wastage + purchases interleaved by createdAt desc)", async () => {
    // 2 wastage rows + 2 purchase rows with interleaved timestamps. Expected
    // merged order is purely by createdAt desc.
    vi.mocked(prisma.wastageEntry.findMany).mockResolvedValue([
      {
        id: "w2",
        quantity: 5,
        dollarValueInCents: 500,
        createdAt: new Date("2026-05-01T12:00:00Z"),
        reason: "SPILLED",
        ingredient: { name: "Milk", unit: "mL" },
      },
      {
        id: "w1",
        quantity: 2,
        dollarValueInCents: 200,
        createdAt: new Date("2026-05-01T09:00:00Z"),
        reason: "EXPIRED",
        ingredient: { name: "Sugar", unit: "g" },
      },
    ] as never);

    vi.mocked(prisma.ingredientPurchase.findMany).mockResolvedValue([
      {
        id: "p2",
        quantity: 1000,
        totalPriceInCents: dec(1500),
        createdAt: new Date("2026-05-01T11:00:00Z"),
        ingredientSupplier: {
          ingredient: { name: "Coffee", unit: "g" },
          supplier: { name: "Acme" },
        },
      },
      {
        id: "p1",
        quantity: 500,
        totalPriceInCents: dec(800),
        createdAt: new Date("2026-05-01T10:00:00Z"),
        ingredientSupplier: {
          ingredient: { name: "Tea", unit: "g" },
          supplier: { name: "Beta" },
        },
      },
    ] as never);

    const result = await getInventoryLog({ cursor: 0, limit: 30 });
    expect(result.success).toBe(true);
    if (!result.success) return;

    // Expected merge order by createdAt desc:
    // w2 12:00 (loss), p2 11:00 (add), p1 10:00 (add), w1 09:00 (loss)
    const ids = result.data.entries.map((e) => e.id);
    expect(ids).toEqual([
      "wastage:w2",
      "purchase:p2",
      "purchase:p1",
      "wastage:w1",
    ]);

    // Shape spot-check
    const first = result.data.entries[0]!;
    expect(first.kind).toBe("loss");
    expect(first.ingredientName).toBe("Milk");
    expect(first.ingredientUnit).toBe("mL");
    expect(first.quantity).toBe(5);
    expect(first.dollarValueInCents).toBe(500);
    // Wastage entries surface the formatted WastageReason as `description`.
    expect(first.description).toBe("Spilled");

    const purchase = result.data.entries[1]!;
    expect(purchase.kind).toBe("add");
    expect(purchase.dollarValueInCents).toBe(1500);
    // Purchase entries surface the supplier name (prefixed) as `description`.
    expect(purchase.description).toBe("Bought from Acme");

    // 4 entries < limit 30 → no more pages
    expect(result.data.nextCursor).toBeNull();
  });

  it("excludes voided + soft-deleted wastage via the where clause", async () => {
    vi.mocked(prisma.wastageEntry.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.ingredientPurchase.findMany).mockResolvedValue([] as never);

    const result = await getInventoryLog({ cursor: 0, limit: 30 });
    expect(result.success).toBe(true);

    const wastageCallArg = vi.mocked(prisma.wastageEntry.findMany).mock.calls[0]![0]!;
    const where = (wastageCallArg as { where: Record<string, unknown> }).where;
    expect(where.cafeId).toBe("cafe-1");
    expect(where.voidedAt).toBeNull();
    expect(where.deletedAt).toBeNull();
  });
});

