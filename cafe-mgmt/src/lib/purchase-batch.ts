/**
 * Heuristic grouping of `IngredientPurchase` rows into "receipts" (real-world
 * shopping trips) for the Purchases history view. A receipt is the set of
 * purchase lines sharing supplier, creator, and the same calendar minute.
 *
 * Trade-off: a bulk insert that straddles a minute boundary (e.g. last line
 * lands at 12:01:00.100 after the first at 12:00:59.900) splits across two
 * receipts. Documented in the spec's I/O Matrix and deferred-work.
 */

const MINUTE_MS = 60_000;

export interface PurchaseRowForGrouping {
  id: string;
  createdAt: Date;
  createdById: string;
  ingredientSupplier: { supplierId: string };
}

export interface ParsedBatchKey {
  supplierId: string;
  createdById: string;
  minuteStart: Date;
  minuteEnd: Date;
}

export function floorToMinute(d: Date): Date {
  return new Date(Math.floor(d.getTime() / MINUTE_MS) * MINUTE_MS);
}

export function batchKeyFor(row: PurchaseRowForGrouping): string {
  const minute = floorToMinute(row.createdAt).toISOString();
  return `${row.ingredientSupplier.supplierId}|${row.createdById}|${minute}`;
}

export function parseBatchKey(key: string): ParsedBatchKey | null {
  const parts = key.split("|");
  if (parts.length !== 3) return null;
  const [supplierId, createdById, minuteIso] = parts;
  if (!supplierId || !createdById || !minuteIso) return null;
  const minuteStart = new Date(minuteIso);
  if (Number.isNaN(minuteStart.getTime())) return null;
  // Defensive: require the canonical UTC ISO form (no TZ offsets, exact ms=0).
  // Without this, "10:30:00+00:30" parses to a different absolute minute than
  // the UI showed, letting a tampered key target a different update window.
  // Round-trip equality covers all non-canonical inputs in one check.
  if (minuteIso !== minuteStart.toISOString()) return null;
  if (minuteStart.getTime() % MINUTE_MS !== 0) return null;
  return {
    supplierId,
    createdById,
    minuteStart,
    minuteEnd: new Date(minuteStart.getTime() + MINUTE_MS),
  };
}

export interface ReceiptLine {
  id: string;
  ingredientId: string;
  ingredientName: string;
  supplierName: string;
  quantity: number;
  unit: string;
  totalPriceInCents: number;
  createdAt: Date;
}

export interface Receipt {
  batchKey: string;
  supplierId: string;
  supplierName: string;
  createdById: string;
  createdByName: string | null;
  minuteStart: Date;
  totalInCents: number;
  invoiceImageUrl: string | null;
  lines: ReceiptLine[];
}

export interface FullPurchaseRow {
  id: string;
  cafeId: string;
  quantity: number;
  unit: string;
  totalPriceInCents: number;
  invoiceImageUrl: string | null;
  createdById: string;
  createdAt: Date;
  createdBy: { name: string | null } | null;
  ingredientSupplier: {
    supplierId: string;
    supplier: { name: string };
    ingredient: { id: string; name: string };
  };
}

export function groupPurchasesIntoReceipts(rows: FullPurchaseRow[]): Receipt[] {
  const byKey = new Map<string, Receipt>();
  for (const row of rows) {
    const key = batchKeyFor(row);
    let receipt = byKey.get(key);
    if (!receipt) {
      receipt = {
        batchKey: key,
        supplierId: row.ingredientSupplier.supplierId,
        supplierName: row.ingredientSupplier.supplier.name,
        createdById: row.createdById,
        createdByName: row.createdBy?.name ?? null,
        minuteStart: floorToMinute(row.createdAt),
        totalInCents: 0,
        invoiceImageUrl: null,
        lines: [],
      };
      byKey.set(key, receipt);
    }
    receipt.totalInCents += row.totalPriceInCents;
    // Any line in the batch can carry the invoice URL — they're all written
    // together by attachPurchaseInvoice. First non-null wins.
    if (receipt.invoiceImageUrl === null && row.invoiceImageUrl !== null) {
      receipt.invoiceImageUrl = row.invoiceImageUrl;
    }
    receipt.lines.push({
      id: row.id,
      ingredientId: row.ingredientSupplier.ingredient.id,
      ingredientName: row.ingredientSupplier.ingredient.name,
      supplierName: row.ingredientSupplier.supplier.name,
      quantity: row.quantity,
      unit: row.unit,
      totalPriceInCents: row.totalPriceInCents,
      createdAt: row.createdAt,
    });
  }

  // Stable order within receipt: oldest line first (matches insert order).
  for (const receipt of byKey.values()) {
    receipt.lines.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  // Receipts: newest first (most recent minuteStart).
  return Array.from(byKey.values()).sort(
    (a, b) => b.minuteStart.getTime() - a.minuteStart.getTime()
  );
}
