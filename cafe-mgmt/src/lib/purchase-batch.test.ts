import { describe, it, expect } from "vitest";
import {
  batchKeyFor,
  parseBatchKey,
  groupPurchasesIntoReceipts,
  floorToMinute,
  type FullPurchaseRow,
  type PurchaseRowForGrouping,
} from "./purchase-batch";

function row(over: Partial<FullPurchaseRow>): FullPurchaseRow {
  return {
    id: "p1",
    cafeId: "cafe-1",
    quantity: 2,
    unit: "kg",
    totalPriceInCents: 1000,
    invoiceImageUrl: null,
    createdById: "user-1",
    createdAt: new Date("2026-04-29T10:30:15.000Z"),
    createdBy: { name: "Alice" },
    ingredientSupplier: {
      supplierId: "sup-A",
      supplier: { name: "Acme" },
      ingredient: { id: "ing-1", name: "Coffee" },
    },
    ...over,
  };
}

describe("floorToMinute", () => {
  it("zeros seconds and milliseconds", () => {
    const d = new Date("2026-04-29T10:30:15.250Z");
    expect(floorToMinute(d).toISOString()).toBe("2026-04-29T10:30:00.000Z");
  });
  it("is idempotent on already-aligned dates", () => {
    const d = new Date("2026-04-29T10:30:00.000Z");
    expect(floorToMinute(d).toISOString()).toBe("2026-04-29T10:30:00.000Z");
  });
});

describe("batchKeyFor", () => {
  function gridRow(over: Partial<PurchaseRowForGrouping> = {}): PurchaseRowForGrouping {
    return {
      id: "p1",
      createdAt: new Date("2026-04-29T10:30:15.000Z"),
      createdById: "user-1",
      ingredientSupplier: { supplierId: "sup-A" },
      ...over,
    };
  }

  it("produces identical keys for same supplier+user+minute (different sub-second times)", () => {
    const a = gridRow({ createdAt: new Date("2026-04-29T10:30:00.001Z") });
    const b = gridRow({ createdAt: new Date("2026-04-29T10:30:59.999Z") });
    expect(batchKeyFor(a)).toBe(batchKeyFor(b));
  });

  it("produces different keys when supplier differs", () => {
    const a = gridRow({ ingredientSupplier: { supplierId: "sup-A" } });
    const b = gridRow({ ingredientSupplier: { supplierId: "sup-B" } });
    expect(batchKeyFor(a)).not.toBe(batchKeyFor(b));
  });

  it("produces different keys when creator differs", () => {
    const a = gridRow({ createdById: "user-1" });
    const b = gridRow({ createdById: "user-2" });
    expect(batchKeyFor(a)).not.toBe(batchKeyFor(b));
  });

  it("produces different keys when minute differs", () => {
    const a = gridRow({ createdAt: new Date("2026-04-29T10:30:59.999Z") });
    const b = gridRow({ createdAt: new Date("2026-04-29T10:31:00.001Z") });
    expect(batchKeyFor(a)).not.toBe(batchKeyFor(b));
  });
});

describe("parseBatchKey", () => {
  it("round-trips a generated key", () => {
    const key = batchKeyFor({
      id: "p1",
      createdAt: new Date("2026-04-29T10:30:15.000Z"),
      createdById: "user-1",
      ingredientSupplier: { supplierId: "sup-A" },
    });
    const parsed = parseBatchKey(key);
    expect(parsed).not.toBeNull();
    expect(parsed!.supplierId).toBe("sup-A");
    expect(parsed!.createdById).toBe("user-1");
    expect(parsed!.minuteStart.toISOString()).toBe("2026-04-29T10:30:00.000Z");
    expect(parsed!.minuteEnd.toISOString()).toBe("2026-04-29T10:31:00.000Z");
  });

  it("returns null for malformed key (wrong segment count)", () => {
    expect(parseBatchKey("a|b")).toBeNull();
    expect(parseBatchKey("a|b|c|d")).toBeNull();
  });

  it("returns null for empty segment", () => {
    expect(parseBatchKey("|user|2026-04-29T10:30:00.000Z")).toBeNull();
    expect(parseBatchKey("sup||2026-04-29T10:30:00.000Z")).toBeNull();
    expect(parseBatchKey("sup|user|")).toBeNull();
  });

  it("returns null for invalid date segment", () => {
    expect(parseBatchKey("sup|user|not-a-date")).toBeNull();
  });

  it("returns null when date is not minute-aligned (defends against window-widening)", () => {
    expect(parseBatchKey("sup|user|2026-04-29T10:30:15.000Z")).toBeNull();
  });

  it("returns null for non-canonical ISO with timezone offset", () => {
    // 10:30:00+00:30 = 10:00 UTC; minute-aligned but lies about the wall-clock.
    expect(parseBatchKey("sup|user|2026-04-29T10:30:00+00:30")).toBeNull();
    expect(parseBatchKey("sup|user|2026-04-29T10:30:00.000-05:00")).toBeNull();
    // Missing milliseconds component
    expect(parseBatchKey("sup|user|2026-04-29T10:30:00Z")).toBeNull();
  });
});

describe("groupPurchasesIntoReceipts", () => {
  it("groups same minute+supplier+creator into one receipt; rolls up total", () => {
    const r1 = row({ id: "p1", quantity: 2, totalPriceInCents: 500, createdAt: new Date("2026-04-29T10:30:00.001Z") });
    const r2 = row({ id: "p2", quantity: 3, totalPriceInCents: 700, createdAt: new Date("2026-04-29T10:30:30.000Z") });
    const result = groupPurchasesIntoReceipts([r1, r2]);
    expect(result.length).toBe(1);
    expect(result[0]!.lines.map((l) => l.id)).toEqual(["p1", "p2"]);
    expect(result[0]!.totalInCents).toBe(1200);
    expect(result[0]!.invoiceImageUrl).toBeNull();
  });

  it("splits across minute boundary (known limitation)", () => {
    const r1 = row({ id: "p1", createdAt: new Date("2026-04-29T10:30:59.900Z") });
    const r2 = row({ id: "p2", createdAt: new Date("2026-04-29T10:31:00.100Z") });
    const result = groupPurchasesIntoReceipts([r1, r2]);
    expect(result.length).toBe(2);
  });

  it("orders receipts newest-first", () => {
    const r1 = row({ id: "p1", createdAt: new Date("2026-04-29T10:00:00Z") });
    const r2 = row({ id: "p2", createdAt: new Date("2026-04-29T11:00:00Z") });
    const r3 = row({ id: "p3", createdAt: new Date("2026-04-29T12:00:00Z") });
    const result = groupPurchasesIntoReceipts([r1, r2, r3]);
    expect(result.map((r) => r.lines[0]!.id)).toEqual(["p3", "p2", "p1"]);
  });

  it("orders lines within a receipt oldest-first", () => {
    const later = row({ id: "p-later", createdAt: new Date("2026-04-29T10:30:45.000Z") });
    const earlier = row({ id: "p-earlier", createdAt: new Date("2026-04-29T10:30:05.000Z") });
    const result = groupPurchasesIntoReceipts([later, earlier]);
    expect(result[0]!.lines.map((l) => l.id)).toEqual(["p-earlier", "p-later"]);
  });

  it("surfaces invoiceImageUrl from any line in the batch (second line carries it)", () => {
    const r1 = row({ id: "p1", invoiceImageUrl: null });
    const r2 = row({ id: "p2", invoiceImageUrl: "data:image/jpeg;base64,XXX" });
    const result = groupPurchasesIntoReceipts([r1, r2]);
    expect(result[0]!.invoiceImageUrl).toBe("data:image/jpeg;base64,XXX");
  });

  it("surfaces invoiceImageUrl when the first line carries it (first non-null wins)", () => {
    const r1 = row({ id: "p1", invoiceImageUrl: "data:image/jpeg;base64,FIRST" });
    const r2 = row({ id: "p2", invoiceImageUrl: null });
    const result = groupPurchasesIntoReceipts([r1, r2]);
    expect(result[0]!.invoiceImageUrl).toBe("data:image/jpeg;base64,FIRST");
  });

  it("separates batches by supplier even at the same minute", () => {
    const r1 = row({ id: "p1", ingredientSupplier: { supplierId: "sup-A", supplier: { name: "Acme" }, ingredient: { id: "i1", name: "Coffee" } } });
    const r2 = row({ id: "p2", ingredientSupplier: { supplierId: "sup-B", supplier: { name: "Beta" }, ingredient: { id: "i1", name: "Coffee" } } });
    const result = groupPurchasesIntoReceipts([r1, r2]);
    expect(result.length).toBe(2);
  });

  it("separates batches by creator even at the same minute + supplier", () => {
    const r1 = row({ id: "p1", createdById: "user-1" });
    const r2 = row({ id: "p2", createdById: "user-2" });
    const result = groupPurchasesIntoReceipts([r1, r2]);
    expect(result.length).toBe(2);
  });

  it("returns empty array for no rows", () => {
    expect(groupPurchasesIntoReceipts([])).toEqual([]);
  });
});
