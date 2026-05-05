import { describe, it, expect } from "vitest";
import {
  consumeFifo,
  restoreFifo,
  currentCostPerUnit,
  findOldestNonEmptyLot,
  type Lot,
  type PurchaseLotInput,
} from "./fifo";

describe("consumeFifo", () => {
  it("consumes within a single lot (happy path)", () => {
    const lots: Lot[] = [
      { id: "A", remaining: 100, perUnitInCents: 500 },
      { id: "B", remaining: 100, perUnitInCents: 700 },
    ];
    const plan = consumeFifo(lots, 50);
    expect(plan).toEqual({
      lotsConsumed: [{ lotId: "A", qty: 50, perUnitInCents: 500, kind: "LOT" }],
      overDeducted: null,
    });
  });

  it("splits across two lots when first is exhausted", () => {
    const lots: Lot[] = [
      { id: "A", remaining: 100, perUnitInCents: 500 },
      { id: "B", remaining: 100, perUnitInCents: 700 },
    ];
    const plan = consumeFifo(lots, 150);
    expect(plan).toEqual({
      lotsConsumed: [
        { lotId: "A", qty: 100, perUnitInCents: 500, kind: "LOT" },
        { lotId: "B", qty: 50, perUnitInCents: 700, kind: "LOT" },
      ],
      overDeducted: null,
    });
  });

  it("over-deduction returns deficit priced at the last lot's price", () => {
    const lots: Lot[] = [
      { id: "A", remaining: 100, perUnitInCents: 500 },
      { id: "B", remaining: 100, perUnitInCents: 700 },
    ];
    const plan = consumeFifo(lots, 250);
    expect(plan).toEqual({
      lotsConsumed: [
        { lotId: "A", qty: 100, perUnitInCents: 500, kind: "LOT" },
        { lotId: "B", qty: 100, perUnitInCents: 700, kind: "LOT" },
      ],
      overDeducted: { qty: 50, perUnitInCents: 700, kind: "OVER_DEDUCTION" },
    });
  });

  it("empty lot list returns over-deducted at price 0", () => {
    const plan = consumeFifo([], 25);
    expect(plan).toEqual({
      lotsConsumed: [],
      overDeducted: { qty: 25, perUnitInCents: 0, kind: "OVER_DEDUCTION" },
    });
  });

  it("requested = 0 returns an empty plan", () => {
    const lots: Lot[] = [{ id: "A", remaining: 100, perUnitInCents: 500 }];
    const plan = consumeFifo(lots, 0);
    expect(plan).toEqual({ lotsConsumed: [], overDeducted: null });
  });

  it("skips zero-remaining lots", () => {
    const lots: Lot[] = [
      { id: "A", remaining: 0, perUnitInCents: 500 },
      { id: "B", remaining: 50, perUnitInCents: 700 },
    ];
    const plan = consumeFifo(lots, 30);
    expect(plan).toEqual({
      lotsConsumed: [{ lotId: "B", qty: 30, perUnitInCents: 700, kind: "LOT" }],
      overDeducted: null,
    });
  });
});

describe("consumeFifo — non-finite inputs", () => {
  it("returns empty plan when requested is NaN", () => {
    const lots: Lot[] = [{ id: "A", remaining: 100, perUnitInCents: 500 }];
    const plan = consumeFifo(lots, Number.NaN);
    expect(plan).toEqual({ lotsConsumed: [], overDeducted: null });
  });

  it("returns empty plan when requested is Infinity", () => {
    const lots: Lot[] = [{ id: "A", remaining: 100, perUnitInCents: 500 }];
    const plan = consumeFifo(lots, Number.POSITIVE_INFINITY);
    expect(plan).toEqual({ lotsConsumed: [], overDeducted: null });
  });

  it("coerces non-finite lot price to 0 in the over-deduction entry", () => {
    const lots: Lot[] = [
      { id: "A", remaining: 100, perUnitInCents: Number.NaN },
    ];
    const plan = consumeFifo(lots, 200);
    expect(plan.overDeducted).not.toBeNull();
    expect(plan.overDeducted?.perUnitInCents).toBe(0);
    expect(plan.overDeducted?.kind).toBe("OVER_DEDUCTION");
  });

  it("tags every satisfied row with kind=LOT", () => {
    const lots: Lot[] = [
      { id: "A", remaining: 50, perUnitInCents: 200 },
      { id: "B", remaining: 50, perUnitInCents: 300 },
    ];
    const plan = consumeFifo(lots, 80);
    expect(plan.lotsConsumed.every((r) => r.kind === "LOT")).toBe(true);
  });
});

describe("restoreFifo", () => {
  it("filters out synthetic null rows and maps to refill increments", () => {
    const result = restoreFifo([
      { ingredientPurchaseId: "lot-1", quantityConsumed: 10 },
      { ingredientPurchaseId: null, quantityConsumed: 5 },
      { ingredientPurchaseId: "lot-2", quantityConsumed: 7 },
    ]);
    expect(result).toEqual([
      { lotId: "lot-1", refillQty: 10 },
      { lotId: "lot-2", refillQty: 7 },
    ]);
  });

  it("returns empty when all rows are synthetic", () => {
    const result = restoreFifo([
      { ingredientPurchaseId: null, quantityConsumed: 3 },
    ]);
    expect(result).toEqual([]);
  });
});

describe("currentCostPerUnit", () => {
  it("returns the manual cost when override is true (ignores lots)", () => {
    const cost = currentCostPerUnit(
      { manualCostOverride: true, costPerUnitInCents: 450 },
      { totalPriceInCents: 9999, quantity: 1 }
    );
    expect(cost).toBe(450);
  });

  it("returns oldest lot per-unit when override is false and a lot exists", () => {
    const cost = currentCostPerUnit(
      { manualCostOverride: false, costPerUnitInCents: 100 },
      { totalPriceInCents: 50000, quantity: 100 }
    );
    expect(cost).toBe(500);
  });

  it("falls back to manual cost when override is false but no lots exist", () => {
    const cost = currentCostPerUnit(
      { manualCostOverride: false, costPerUnitInCents: 250 },
      null
    );
    expect(cost).toBe(250);
  });

  it("returns null when override is false, no lots, and no fallback", () => {
    const cost = currentCostPerUnit(
      { manualCostOverride: false, costPerUnitInCents: null },
      null
    );
    expect(cost).toBeNull();
  });

  it("returns null when override is true but cost is null", () => {
    const cost = currentCostPerUnit(
      { manualCostOverride: true, costPerUnitInCents: null },
      { totalPriceInCents: 1000, quantity: 10 }
    );
    expect(cost).toBeNull();
  });
});

describe("findOldestNonEmptyLot", () => {
  function lot(over: Partial<PurchaseLotInput> = {}): PurchaseLotInput {
    return {
      id: "p1",
      createdAt: new Date("2026-04-29T10:00:00Z"),
      remainingQuantity: 5,
      totalPriceInCents: 500,
      quantity: 10,
      ...over,
    };
  }

  it("returns null for an empty array", () => {
    expect(findOldestNonEmptyLot([])).toBeNull();
  });

  it("returns null when every lot is depleted", () => {
    expect(
      findOldestNonEmptyLot([
        lot({ id: "p1", remainingQuantity: 0 }),
        lot({ id: "p2", remainingQuantity: 0 }),
      ])
    ).toBeNull();
  });

  it("returns the only live lot when there is just one", () => {
    const result = findOldestNonEmptyLot([
      lot({ id: "p1", totalPriceInCents: 800, quantity: 10, remainingQuantity: 7 }),
    ]);
    expect(result).toEqual({ totalPriceInCents: 800, quantity: 10 });
  });

  it("picks the oldest non-empty lot, ignoring depleted lots even if they're older", () => {
    const result = findOldestNonEmptyLot([
      lot({
        id: "older-but-empty",
        createdAt: new Date("2026-04-20T10:00:00Z"),
        remainingQuantity: 0,
        totalPriceInCents: 100,
        quantity: 1,
      }),
      lot({
        id: "newer-but-live",
        createdAt: new Date("2026-04-25T10:00:00Z"),
        remainingQuantity: 5,
        totalPriceInCents: 500,
        quantity: 10,
      }),
      lot({
        id: "newest-live",
        createdAt: new Date("2026-04-29T10:00:00Z"),
        remainingQuantity: 5,
        totalPriceInCents: 1500,
        quantity: 10,
      }),
    ]);
    expect(result).toEqual({ totalPriceInCents: 500, quantity: 10 });
  });

  it("tie-breaks identical createdAt by id ascending (matches consumeFifo)", () => {
    const ts = new Date("2026-04-29T10:00:00Z");
    const result = findOldestNonEmptyLot([
      lot({ id: "pZ", createdAt: ts, totalPriceInCents: 999, quantity: 10 }),
      lot({ id: "pA", createdAt: ts, totalPriceInCents: 100, quantity: 10 }),
    ]);
    expect(result).toEqual({ totalPriceInCents: 100, quantity: 10 });
  });

  it("accepts ISO-string createdAt (client-side shape)", () => {
    const result = findOldestNonEmptyLot([
      lot({ id: "newer", createdAt: "2026-04-29T10:00:00.000Z", totalPriceInCents: 999, quantity: 10 }),
      lot({ id: "older", createdAt: "2026-04-25T10:00:00.000Z", totalPriceInCents: 100, quantity: 10 }),
    ]);
    expect(result).toEqual({ totalPriceInCents: 100, quantity: 10 });
  });

  it("skips lots with quantity <= 0 (data corruption defense — divisor for per-unit math)", () => {
    const result = findOldestNonEmptyLot([
      lot({ id: "older-zero-qty", createdAt: new Date("2026-04-20Z"), quantity: 0, remainingQuantity: 5, totalPriceInCents: 999 }),
      lot({ id: "newer-valid", createdAt: new Date("2026-04-25Z"), quantity: 10, remainingQuantity: 5, totalPriceInCents: 100 }),
    ]);
    expect(result).toEqual({ totalPriceInCents: 100, quantity: 10 });
  });

  it("skips lots whose ISO createdAt is invalid (NaN-time would otherwise poison best)", () => {
    // Without the NaN guard, an invalid first row would set `best` and every
    // later valid row would lose to it (NaN comparisons all false).
    const result = findOldestNonEmptyLot([
      lot({ id: "first-invalid", createdAt: "not-a-date", totalPriceInCents: 999, quantity: 10, remainingQuantity: 5 }),
      lot({ id: "second-valid", createdAt: "2026-04-25T10:00:00.000Z", totalPriceInCents: 100, quantity: 10, remainingQuantity: 5 }),
    ]);
    expect(result).toEqual({ totalPriceInCents: 100, quantity: 10 });
  });

  it("returns null when every lot has invalid createdAt", () => {
    const result = findOldestNonEmptyLot([
      lot({ id: "p1", createdAt: "garbage", remainingQuantity: 5 }),
      lot({ id: "p2", createdAt: "more-garbage", remainingQuantity: 5 }),
    ]);
    expect(result).toBeNull();
  });
});
