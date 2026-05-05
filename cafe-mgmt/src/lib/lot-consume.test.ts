import { describe, it, expect, vi } from "vitest";
import {
  applyConsumeFifo,
  applyRestoreFifo,
  getAvailableQty,
  encodeOverDeductionError,
  parseOverDeductionError,
  LOT_RACE,
} from "./lot-consume";

type AnyTx = Parameters<typeof applyConsumeFifo>[0];

function makeTx(overrides: Record<string, unknown>): AnyTx {
  return overrides as unknown as AnyTx;
}

describe("applyConsumeFifo", () => {
  it("happy path: consumes from oldest lot, decrements, writes LOT row", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "lot-A",
        remainingQuantity: 100,
        quantity: 100,
        totalPriceInCents: 50000, // 500/unit
      },
      {
        id: "lot-B",
        remainingQuantity: 100,
        quantity: 100,
        totalPriceInCents: 70000,
      },
    ]);
    const purchaseUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const consumptionCreate = vi.fn().mockResolvedValue({});

    const tx = makeTx({
      ingredientPurchase: { findMany, updateMany: purchaseUpdateMany },
      lotConsumption: { create: consumptionCreate },
    });

    const result = await applyConsumeFifo(tx, {
      cafeId: "cafe-1",
      ingredientId: "ing-1",
      requested: 30,
      sourceType: "WASTAGE",
      sourceId: "wast-1",
    });

    expect(purchaseUpdateMany).toHaveBeenCalledTimes(1);
    expect(purchaseUpdateMany).toHaveBeenCalledWith({
      where: { id: "lot-A", remainingQuantity: { gte: 30 } },
      data: { remainingQuantity: { decrement: 30 } },
    });
    expect(consumptionCreate).toHaveBeenCalledTimes(1);
    expect(consumptionCreate).toHaveBeenCalledWith({
      data: {
        cafeId: "cafe-1",
        sourceType: "WASTAGE",
        sourceId: "wast-1",
        ingredientPurchaseId: "lot-A",
        quantityConsumed: 30,
        perUnitInCents: 500,
        consumptionKind: "LOT",
      },
    });
    expect(result.totalCostInCents).toBe(30 * 500);
    expect(result.totalConsumedQty).toBe(30);
    expect(result.overDeducted).toBeNull();
    expect(result.lotsConsumed).toHaveLength(1);
  });

  it("over-deduction: writes synthetic OVER_DEDUCTION row at last lot's price", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "lot-A", remainingQuantity: 100, quantity: 100, totalPriceInCents: 50000 },
      { id: "lot-B", remainingQuantity: 100, quantity: 100, totalPriceInCents: 70000 },
    ]);
    const purchaseUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const consumptionCreate = vi.fn().mockResolvedValue({});

    const tx = makeTx({
      ingredientPurchase: { findMany, updateMany: purchaseUpdateMany },
      lotConsumption: { create: consumptionCreate },
    });

    const result = await applyConsumeFifo(tx, {
      cafeId: "cafe-1",
      ingredientId: "ing-1",
      requested: 250,
      sourceType: "WASTAGE",
      sourceId: "wast-2",
    });

    // 2 LOT updates + 0 for synthetic
    expect(purchaseUpdateMany).toHaveBeenCalledTimes(2);
    // 2 LOT rows + 1 OVER_DEDUCTION row
    expect(consumptionCreate).toHaveBeenCalledTimes(3);
    const calls = consumptionCreate.mock.calls.map((c) => c[0].data);
    expect(calls[0].consumptionKind).toBe("LOT");
    expect(calls[1].consumptionKind).toBe("LOT");
    expect(calls[2]).toMatchObject({
      cafeId: "cafe-1",
      sourceType: "WASTAGE",
      sourceId: "wast-2",
      ingredientPurchaseId: null,
      quantityConsumed: 50,
      perUnitInCents: 700,
      consumptionKind: "OVER_DEDUCTION",
    });
    expect(result.overDeducted).not.toBeNull();
    expect(result.totalConsumedQty).toBe(250);
    expect(result.totalCostInCents).toBe(100 * 500 + 100 * 700 + 50 * 700);
  });

  it("no lots at all: writes one OVER_DEDUCTION row at price 0", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const purchaseUpdateMany = vi.fn();
    const consumptionCreate = vi.fn().mockResolvedValue({});

    const tx = makeTx({
      ingredientPurchase: { findMany, updateMany: purchaseUpdateMany },
      lotConsumption: { create: consumptionCreate },
    });

    const result = await applyConsumeFifo(tx, {
      cafeId: "cafe-1",
      ingredientId: "ing-1",
      requested: 25,
      sourceType: "COMP",
      sourceId: "comp-1",
    });

    expect(purchaseUpdateMany).not.toHaveBeenCalled();
    expect(consumptionCreate).toHaveBeenCalledTimes(1);
    expect(consumptionCreate).toHaveBeenCalledWith({
      data: {
        cafeId: "cafe-1",
        sourceType: "COMP",
        sourceId: "comp-1",
        ingredientPurchaseId: null,
        quantityConsumed: 25,
        perUnitInCents: 0,
        consumptionKind: "OVER_DEDUCTION",
      },
    });
    expect(result.totalCostInCents).toBe(0);
  });

  it("race retry: throws LOT_RACE when conditional updateMany matches zero rows", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "lot-A",
        remainingQuantity: 100,
        quantity: 100,
        totalPriceInCents: 50000,
      },
    ]);
    // Concurrent txn drained the lot first → updateMany matches 0 rows.
    const purchaseUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
    const consumptionCreate = vi.fn().mockResolvedValue({});

    const tx = makeTx({
      ingredientPurchase: { findMany, updateMany: purchaseUpdateMany },
      lotConsumption: { create: consumptionCreate },
    });

    await expect(
      applyConsumeFifo(tx, {
        cafeId: "cafe-1",
        ingredientId: "ing-1",
        requested: 30,
        sourceType: "WASTAGE",
        sourceId: "wast-race",
      })
    ).rejects.toThrow(LOT_RACE);

    // The conditional update was attempted with the gte guard...
    expect(purchaseUpdateMany).toHaveBeenCalledWith({
      where: { id: "lot-A", remainingQuantity: { gte: 30 } },
      data: { remainingQuantity: { decrement: 30 } },
    });
    // ...and we did NOT proceed to write the consumption row.
    expect(consumptionCreate).not.toHaveBeenCalled();
  });

  it("conditional decrement: every updateMany call carries the gte guard", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "lot-A", remainingQuantity: 100, quantity: 100, totalPriceInCents: 50000 },
      { id: "lot-B", remainingQuantity: 100, quantity: 100, totalPriceInCents: 70000 },
    ]);
    const purchaseUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const consumptionCreate = vi.fn().mockResolvedValue({});

    const tx = makeTx({
      ingredientPurchase: { findMany, updateMany: purchaseUpdateMany },
      lotConsumption: { create: consumptionCreate },
    });

    await applyConsumeFifo(tx, {
      cafeId: "cafe-1",
      ingredientId: "ing-1",
      requested: 150,
      sourceType: "WASTAGE",
      sourceId: "wast-guard",
    });

    expect(purchaseUpdateMany).toHaveBeenCalledTimes(2);
    for (const call of purchaseUpdateMany.mock.calls) {
      const where = call[0].where;
      expect(where).toHaveProperty("id");
      expect(where.remainingQuantity).toMatchObject({ gte: expect.any(Number) });
      // gte must equal the decrement amount on the same call
      expect(where.remainingQuantity.gte).toBe(call[0].data.remainingQuantity.decrement);
    }
  });
});

describe("applyRestoreFifo", () => {
  it("refills LOT-kind lots, leaves OVER_DEDUCTION rows alone, then deletes all", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "lc-1",
        ingredientPurchaseId: "lot-A",
        quantityConsumed: 30,
        consumptionKind: "LOT",
      },
      {
        id: "lc-2",
        ingredientPurchaseId: null,
        quantityConsumed: 10,
        consumptionKind: "OVER_DEDUCTION",
      },
      {
        id: "lc-3",
        ingredientPurchaseId: "lot-B",
        quantityConsumed: 5,
        consumptionKind: "LOT",
      },
    ]);
    const purchaseUpdate = vi.fn().mockResolvedValue({});
    const deleteMany = vi.fn().mockResolvedValue({});

    const tx = makeTx({
      ingredientPurchase: { update: purchaseUpdate },
      lotConsumption: { findMany, deleteMany },
    });

    await applyRestoreFifo(tx, { sourceType: "WASTAGE", sourceId: "wast-1" });

    // Only LOT rows refill
    expect(purchaseUpdate).toHaveBeenCalledTimes(2);
    expect(purchaseUpdate).toHaveBeenCalledWith({
      where: { id: "lot-A" },
      data: { remainingQuantity: { increment: 30 } },
    });
    expect(purchaseUpdate).toHaveBeenCalledWith({
      where: { id: "lot-B" },
      data: { remainingQuantity: { increment: 5 } },
    });
    // All rows deleted at the end
    expect(deleteMany).toHaveBeenCalledWith({
      where: { sourceType: "WASTAGE", sourceId: "wast-1" },
    });
  });

  it("no rows: deletes nothing, refills nothing", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const purchaseUpdate = vi.fn();
    const deleteMany = vi.fn().mockResolvedValue({});

    const tx = makeTx({
      ingredientPurchase: { update: purchaseUpdate },
      lotConsumption: { findMany, deleteMany },
    });

    await applyRestoreFifo(tx, { sourceType: "COMP", sourceId: "comp-x" });
    expect(purchaseUpdate).not.toHaveBeenCalled();
    expect(deleteMany).toHaveBeenCalledTimes(1);
  });
});

describe("getAvailableQty", () => {
  it("returns the sum of remaining quantities", async () => {
    const aggregate = vi.fn().mockResolvedValue({
      _sum: { remainingQuantity: 175 },
    });
    const tx = makeTx({ ingredientPurchase: { aggregate } });
    const result = await getAvailableQty(tx, "ing-1", "cafe-1");
    expect(result).toBe(175);
  });

  it("returns 0 when no lots match", async () => {
    const aggregate = vi.fn().mockResolvedValue({
      _sum: { remainingQuantity: null },
    });
    const tx = makeTx({ ingredientPurchase: { aggregate } });
    const result = await getAvailableQty(tx, "ing-1", "cafe-1");
    expect(result).toBe(0);
  });
});

describe("over-deduction wire format", () => {
  it("encode + parse round-trip", () => {
    const wire = encodeOverDeductionError({
      availableQty: 100,
      requestedQty: 250,
    });
    expect(wire.startsWith("OVER_DEDUCTION:")).toBe(true);
    const parsed = parseOverDeductionError(wire);
    expect(parsed).toEqual({ availableQty: 100, requestedQty: 250 });
  });

  it("returns null for non-matching error string", () => {
    expect(parseOverDeductionError("Failed to log wastage")).toBeNull();
  });

  it("returns null for malformed payload", () => {
    expect(parseOverDeductionError("OVER_DEDUCTION:not-json")).toBeNull();
  });
});
