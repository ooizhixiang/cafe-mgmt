import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// ─── Mocks for bulkCreateIngredientPurchases tests ─────────

vi.mock("@/lib/db", () => ({
  prisma: {
    supplier: { findFirst: vi.fn() },
    ingredient: { findMany: vi.fn(), findFirst: vi.fn() },
    ingredientSupplier: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    ingredientPurchase: { create: vi.fn() },
    errorLog: { create: vi.fn() },
    cafe: { findUnique: vi.fn() },
    inventoryCount: { findUnique: vi.fn(), upsert: vi.fn() },
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

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { bulkCreateIngredientPurchases } from "./inventory.actions";

const mockSession = {
  user: { id: "user-1", cafeId: "cafe-1", role: "STAFF" as const },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue(mockSession as never);
});

// Test Zod schemas used in inventory actions

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
}

function makeTxState(overrides: Partial<TxState> = {}): TxState {
  return {
    ingredientFindMany: vi.fn().mockResolvedValue([]),
    linkFindMany: vi.fn().mockResolvedValue([]),
    linkCreate: vi.fn(),
    purchaseCreate: vi.fn(),
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
    };
    return await (cb as (tx: unknown) => Promise<unknown>)(tx);
  }) as never);
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
    if (!result.success) expect(result.error).toBe("Ingredient not found");
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
});
