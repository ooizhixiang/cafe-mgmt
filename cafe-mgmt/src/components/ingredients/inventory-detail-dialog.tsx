"use client";

import { useEffect, useMemo, useRef } from "react";
import type { IngredientPurchaseRow } from "@/components/ingredients/ingredient-suppliers-panel";
import { formatCents } from "@/lib/format";
import { convert, formatConvertedQuantity } from "@/lib/unit-conversion";

interface Props {
  open: boolean;
  ingredientName: string;
  ingredientUnit: string;
  /**
   * Optional within-dimension display target. When set AND each lot's stored
   * unit is convertible to it, lot rows + supplier-total subtitles render
   * the converted quantity with the display-unit label.
   */
  displayUnit?: string | null;
  purchases: IngredientPurchaseRow[];
  onClose: () => void;
}

/**
 * Returns `{ qty, unit }` to render: converted into `displayUnit` when both
 * stored and target are within the same dimension, otherwise the original.
 */
function renderQty(
  storedQty: number,
  storedUnit: string,
  displayUnit: string | null | undefined
): { text: string; unit: string } {
  if (!displayUnit || displayUnit === storedUnit) {
    return { text: String(storedQty), unit: storedUnit };
  }
  const converted = convert(storedQty, storedUnit, displayUnit);
  if (converted === null) {
    return { text: String(storedQty), unit: storedUnit };
  }
  return { text: formatConvertedQuantity(converted), unit: displayUnit };
}

interface SupplierGroup {
  supplierKey: string;
  supplierName: string;
  totalRemaining: number;
  lots: IngredientPurchaseRow[];
}

function formatLotDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function unitCostCents(lot: IngredientPurchaseRow): number | null {
  if (lot.quantity <= 0) return null;
  return Math.round(lot.totalPriceInCents / lot.quantity);
}

export function buildSupplierGroups(
  purchases: IngredientPurchaseRow[]
): SupplierGroup[] {
  const liveLots = purchases.filter((p) => p.remainingQuantity > 0);
  const byKey = new Map<string, SupplierGroup>();
  for (const lot of liveLots) {
    const key = lot.ingredientSupplierId;
    let group = byKey.get(key);
    if (!group) {
      group = {
        supplierKey: key,
        supplierName: lot.supplierName,
        totalRemaining: 0,
        lots: [],
      };
      byKey.set(key, group);
    }
    group.totalRemaining += lot.remainingQuantity;
    group.lots.push(lot);
  }

  for (const group of byKey.values()) {
    group.lots.sort((a, b) => {
      const at = new Date(a.createdAt).getTime();
      const bt = new Date(b.createdAt).getTime();
      if (at !== bt) return at - bt;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }

  return Array.from(byKey.values()).sort((a, b) => {
    const ao = new Date(a.lots[0]!.createdAt).getTime();
    const bo = new Date(b.lots[0]!.createdAt).getTime();
    if (ao !== bo) return ao - bo;
    if (a.lots[0]!.id < b.lots[0]!.id) return -1;
    if (a.lots[0]!.id > b.lots[0]!.id) return 1;
    return 0;
  });
}

export function InventoryDetailDialog({
  open,
  ingredientName,
  ingredientUnit,
  displayUnit = null,
  purchases,
  onClose,
}: Props) {
  const groups = useMemo(() => buildSupplierGroups(purchases), [purchases]);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // Tracks whether the current mouse interaction started on the backdrop. Without this,
  // a text-selection drag that starts inside the card and releases on the backdrop fires
  // a click on the common ancestor (backdrop) and would close the dialog mid-selection.
  const downedOnBackdropRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const noPurchasesEver = purchases.length === 0;
  const allExhausted = !noPurchasesEver && groups.length === 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Inventory details for ${ingredientName}`}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]"
      onMouseDown={(e) => {
        downedOnBackdropRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (downedOnBackdropRef.current && e.target === e.currentTarget) {
          onClose();
        }
        downedOnBackdropRef.current = false;
      }}
    >
      <div
        className="bg-[var(--bg-primary)] rounded-lg p-[var(--space-6)] mx-[var(--space-4)] max-w-md w-full max-h-[80vh] overflow-y-auto animate-[fadeIn_0.15s_ease-out]"
        style={{ boxShadow: "var(--shadow-lg)" }}
      >
        <div className="flex items-start justify-between mb-[var(--space-4)]">
          <div>
            <h2 className="text-value">{ingredientName}</h2>
            <p className="text-meta text-[var(--text-secondary)]">
              Inventory details by supplier
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close inventory details"
            className="touch-target px-3 py-1 rounded-lg text-meta font-medium text-[var(--text-secondary)] active:bg-[var(--bg-secondary)]"
          >
            Close
          </button>
        </div>

        {noPurchasesEver && (
          <p className="text-body text-[var(--text-secondary)]">
            No purchases logged for this ingredient yet.
          </p>
        )}

        {allExhausted && (
          <p className="text-body text-[var(--text-secondary)]">
            No remaining stock from any supplier.
          </p>
        )}

        {groups.length > 0 && (
          <ul className="space-y-[var(--space-4)]">
            {groups.map((group) => {
              // Supplier total is implicitly in `ingredientUnit` (sum of
              // remainingQuantity across that supplier's lots, all stored in
              // the ingredient's unit). Convert for display when displayUnit
              // is set AND compatible.
              const totalDisplay = renderQty(
                group.totalRemaining,
                ingredientUnit,
                displayUnit
              );
              return (
              <li key={group.supplierKey}>
                <div className="mb-[var(--space-2)]">
                  <p className="text-body font-semibold">{group.supplierName}</p>
                  <p className="text-meta text-[var(--text-secondary)]">
                    {totalDisplay.text} {totalDisplay.unit} remaining across{" "}
                    {group.lots.length} live lot
                    {group.lots.length === 1 ? "" : "s"}
                  </p>
                </div>
                <ul className="space-y-[var(--space-1)]">
                  {group.lots.map((lot) => {
                    const cost = unitCostCents(lot);
                    // lot.unit is the unit at purchase time (matches lot.quantity
                    // / lot.remainingQuantity). Convert when displayUnit is set
                    // AND in the same dimension; otherwise fall back to lot.unit.
                    const remainingDisp = renderQty(lot.remainingQuantity, lot.unit, displayUnit);
                    const totalDisp = renderQty(lot.quantity, lot.unit, displayUnit);
                    return (
                      <li
                        key={lot.id}
                        className="flex justify-between text-meta border-l-2 border-[var(--border-default)] pl-[var(--space-3)] py-1"
                      >
                        <span>
                          {formatLotDate(lot.createdAt)} —{" "}
                          {remainingDisp.text}/{totalDisp.text} {remainingDisp.unit}
                        </span>
                        <span className="text-[var(--text-secondary)]">
                          {cost === null ? "—" : `${formatCents(cost)}/unit`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
