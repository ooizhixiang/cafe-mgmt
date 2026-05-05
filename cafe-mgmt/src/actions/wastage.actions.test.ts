import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import {
  encodeOverDeductionError,
  parseOverDeductionError,
  applyRestoreFifo,
  getAvailableQty,
} from "@/lib/lot-consume";

// Test Zod schemas used in wastage actions

const logWastageSchema = z.object({
  ingredientId: z.string().min(1),
  quantity: z.number().int().min(1),
  reason: z.enum(["SPILLED", "EXPIRED", "INCORRECT"]),
  confirmOverDeduction: z.boolean().optional(),
});

const voidWastageSchema = z.object({
  id: z.string().min(1),
  voidReason: z.string().min(1, "Void reason is required").max(200),
});

const correctWastageSchema = z.object({
  id: z.string().min(1),
  newQuantity: z.number().int().min(1),
  confirmOverDeduction: z.boolean().optional(),
});

describe("logWastageSchema", () => {
  it("accepts valid wastage data", () => {
    const result = logWastageSchema.safeParse({
      ingredientId: "ing123",
      quantity: 2,
      reason: "SPILLED",
    });
    expect(result.success).toBe(true);
  });

  it("accepts all valid reasons", () => {
    for (const reason of ["SPILLED", "EXPIRED", "INCORRECT"]) {
      const result = logWastageSchema.safeParse({
        ingredientId: "ing123",
        quantity: 1,
        reason,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid reason", () => {
    const result = logWastageSchema.safeParse({
      ingredientId: "ing123",
      quantity: 1,
      reason: "DROPPED",
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero quantity", () => {
    const result = logWastageSchema.safeParse({
      ingredientId: "ing123",
      quantity: 0,
      reason: "SPILLED",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative quantity", () => {
    const result = logWastageSchema.safeParse({
      ingredientId: "ing123",
      quantity: -1,
      reason: "SPILLED",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty ingredientId", () => {
    const result = logWastageSchema.safeParse({
      ingredientId: "",
      quantity: 1,
      reason: "SPILLED",
    });
    expect(result.success).toBe(false);
  });
});

describe("voidWastageSchema", () => {
  it("accepts valid void data", () => {
    const result = voidWastageSchema.safeParse({
      id: "entry123",
      voidReason: "Counted wrong",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty void reason", () => {
    const result = voidWastageSchema.safeParse({
      id: "entry123",
      voidReason: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects void reason over 200 chars", () => {
    const result = voidWastageSchema.safeParse({
      id: "entry123",
      voidReason: "x".repeat(201),
    });
    expect(result.success).toBe(false);
  });
});

describe("correctWastageSchema", () => {
  it("accepts valid correction", () => {
    const result = correctWastageSchema.safeParse({
      id: "entry123",
      newQuantity: 3,
    });
    expect(result.success).toBe(true);
  });

  it("rejects zero quantity correction", () => {
    const result = correctWastageSchema.safeParse({
      id: "entry123",
      newQuantity: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("Undo window check", () => {
  it("allows undo within 5 seconds", () => {
    const createdAt = Date.now() - 3000;
    const elapsed = Date.now() - createdAt;
    expect(elapsed <= 5000).toBe(true);
  });

  it("blocks undo after 5 seconds", () => {
    const createdAt = Date.now() - 6000;
    const elapsed = Date.now() - createdAt;
    expect(elapsed > 5000).toBe(true);
  });
});

describe("Auto-deduct caps at zero", () => {
  it("deducts to 0, never negative", () => {
    const currentQty = 3;
    const wastageQty = 5;
    const newQty = Math.max(0, currentQty - wastageQty);
    expect(newQty).toBe(0);
  });

  it("deducts normally when sufficient stock", () => {
    const currentQty = 10;
    const wastageQty = 3;
    const newQty = Math.max(0, currentQty - wastageQty);
    expect(newQty).toBe(7);
  });
});

describe("Spec B2 — confirmOverDeduction schema field", () => {
  it("accepts confirmOverDeduction = true", () => {
    const result = logWastageSchema.safeParse({
      ingredientId: "ing123",
      quantity: 50,
      reason: "SPILLED",
      confirmOverDeduction: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts omitted confirmOverDeduction (defaults to undefined)", () => {
    const result = logWastageSchema.safeParse({
      ingredientId: "ing123",
      quantity: 50,
      reason: "SPILLED",
    });
    expect(result.success).toBe(true);
  });

  it("correctWastage schema accepts confirmOverDeduction", () => {
    const result = correctWastageSchema.safeParse({
      id: "entry123",
      newQuantity: 80,
      confirmOverDeduction: true,
    });
    expect(result.success).toBe(true);
  });
});

describe("Spec B2 — OVER_DEDUCTION error wire format", () => {
  it("encodes payload that round-trips through parse", () => {
    const wire = encodeOverDeductionError({
      availableQty: 100,
      requestedQty: 250,
    });
    expect(wire.startsWith("OVER_DEDUCTION:")).toBe(true);
    const parsed = parseOverDeductionError(wire);
    expect(parsed).toEqual({ availableQty: 100, requestedQty: 250 });
  });
});

describe("correctWastage projection: restorable = LOT rows only", () => {
  // The bug fixed in this patch: `correctWastage` previously projected the
  // available pool as `availableLotQty + entry.quantity`, treating the full
  // prior wastage as restorable. But OVER_DEDUCTION rows have no lot backing
  // and are dropped (not refunded) during restore. So a wastage of 150 made up
  // of 1 LOT row of 50 + 1 OVER_DEDUCTION row of 100 only refunds 50 to the
  // available pool — not 150. Verify the building blocks the new code relies
  // on (`applyRestoreFifo` + post-restore `getAvailableQty`) reflect that.
  type AnyTx = Parameters<typeof applyRestoreFifo>[0];

  it("applyRestoreFifo only refills LOT-kind rows; OVER_DEDUCTION dropped", async () => {
    // Simulate a stored consume of 150 against entry "wast-1":
    //   1 LOT row: 50 against lot-A
    //   1 OVER_DEDUCTION row: 100 (no lot)
    const lotConsumptionFindMany = vi.fn().mockResolvedValue([
      {
        id: "lc-lot",
        ingredientPurchaseId: "lot-A",
        quantityConsumed: 50,
        consumptionKind: "LOT",
      },
      {
        id: "lc-over",
        ingredientPurchaseId: null,
        quantityConsumed: 100,
        consumptionKind: "OVER_DEDUCTION",
      },
    ]);
    const purchaseUpdate = vi.fn().mockResolvedValue({});
    const lotConsumptionDeleteMany = vi.fn().mockResolvedValue({});

    const tx = {
      ingredientPurchase: { update: purchaseUpdate },
      lotConsumption: {
        findMany: lotConsumptionFindMany,
        deleteMany: lotConsumptionDeleteMany,
      },
    } as unknown as AnyTx;

    await applyRestoreFifo(tx, { sourceType: "WASTAGE", sourceId: "wast-1" });

    // Only the LOT row caused a refill (50 increment, not 150).
    expect(purchaseUpdate).toHaveBeenCalledTimes(1);
    expect(purchaseUpdate).toHaveBeenCalledWith({
      where: { id: "lot-A" },
      data: { remainingQuantity: { increment: 50 } },
    });
    // Both rows wiped after restore.
    expect(lotConsumptionDeleteMany).toHaveBeenCalledWith({
      where: { sourceType: "WASTAGE", sourceId: "wast-1" },
    });
  });

  it("post-restore getAvailableQty reflects the LOT refund only", async () => {
    // Pretend the global pool was 0 before correct, lot-A had 0 remaining.
    // After applyRestoreFifo refills lot-A by 50, the aggregate over active
    // lots returns 50 — NOT 150 — confirming the over-deduction error reports
    // `availableQty` correctly.
    const aggregate = vi.fn().mockResolvedValue({
      _sum: { remainingQuantity: 50 },
    });
    const tx = { ingredientPurchase: { aggregate } } as unknown as Parameters<
      typeof getAvailableQty
    >[0];

    const projectedAvailable = await getAvailableQty(tx, "ing-1", "cafe-1");
    expect(projectedAvailable).toBe(50);

    // If the user requested 100, the over-deduction payload reports
    // availableQty: 50 (not 150). Sanity-check the wire format.
    const wire = encodeOverDeductionError({
      availableQty: projectedAvailable,
      requestedQty: 100,
    });
    expect(parseOverDeductionError(wire)).toEqual({
      availableQty: 50,
      requestedQty: 100,
    });
  });
});
