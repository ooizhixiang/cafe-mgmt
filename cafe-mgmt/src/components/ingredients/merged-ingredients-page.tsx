"use client";

import { useEffect, useState } from "react";
import { IngredientSpreadsheet } from "@/components/ingredients/ingredient-spreadsheet";
import { InventoryList } from "@/components/inventory/inventory-list";

type View = "spreadsheet" | "count";

type SpreadsheetProps = React.ComponentProps<typeof IngredientSpreadsheet>;
type InventoryListProps = React.ComponentProps<typeof InventoryList>;

interface MergedIngredientsPageProps {
  userRole: "MANAGER" | "STAFF";
  spreadsheetProps: SpreadsheetProps;
  inventoryListProps: InventoryListProps;
}

const STORAGE_KEY = "ingredients.view";

export function MergedIngredientsPage({
  userRole,
  spreadsheetProps,
  inventoryListProps,
}: MergedIngredientsPageProps) {
  const isManager = userRole === "MANAGER";
  // Default = spreadsheet for managers, count for staff. Staff can never see
  // spreadsheet regardless of localStorage — server-authoritative role gate.
  const [view, setView] = useState<View>(isManager ? "spreadsheet" : "count");

  // Hydrate manager's view from localStorage on mount. Wrapped in try/catch so
  // SSR / private-mode / blocked-storage doesn't crash render. Staff is force-
  // rendered as Count regardless of localStorage value.
  useEffect(() => {
    if (!isManager) return;
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "count" || v === "spreadsheet") {
        setView(v);
      }
    } catch {}
  }, [isManager]);

  function handleSetView(next: View) {
    setView(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }

  // Staff: render only the Count view; no toggle in the header at all.
  if (!isManager) {
    return (
      <div className="p-[var(--space-4)] pt-[var(--space-6)] lg:p-8 lg:pt-10 lg:max-w-[960px] lg:mx-auto">
        <h1 className="text-headline mb-[var(--space-1)]">Inventory</h1>
        <p className="text-meta text-[var(--text-secondary)] mb-[var(--space-4)]">
          Track and manage your stock
        </p>
        <InventoryList {...inventoryListProps} />
      </div>
    );
  }

  const isSpreadsheet = view === "spreadsheet";

  return (
    <div
      className={
        isSpreadsheet
          ? "p-[var(--space-4)] pt-[var(--space-6)] lg:p-8 lg:pt-10 lg:max-w-[1280px] lg:mx-auto"
          : "p-[var(--space-4)] pt-[var(--space-6)] lg:p-8 lg:pt-10 lg:max-w-[960px] lg:mx-auto"
      }
    >
      <div className="flex items-start justify-between gap-[var(--space-3)] mb-[var(--space-4)]">
        <div>
          <h1 className="text-headline mb-[var(--space-1)]">Inventory</h1>
          <p className="text-meta text-[var(--text-secondary)]">
            {isSpreadsheet
              ? "Set costs, thresholds, snap increments, and categories for each ingredient."
              : "Track and manage your stock"}
          </p>
        </div>
        <div
          role="group"
          aria-label="View mode"
          className="inline-flex shrink-0 rounded border border-[var(--border-default)] overflow-hidden"
        >
          <button
            type="button"
            onClick={() => handleSetView("spreadsheet")}
            aria-pressed={isSpreadsheet}
            className={`text-meta font-medium whitespace-nowrap px-[var(--space-3)] py-[var(--space-1)] ${
              isSpreadsheet
                ? "bg-[var(--color-info)] text-white"
                : "text-[var(--color-info)]"
            }`}
          >
            Spreadsheet
          </button>
          <button
            type="button"
            onClick={() => handleSetView("count")}
            aria-pressed={!isSpreadsheet}
            className={`text-meta font-medium whitespace-nowrap px-[var(--space-3)] py-[var(--space-1)] border-l border-[var(--border-default)] ${
              !isSpreadsheet
                ? "bg-[var(--color-info)] text-white"
                : "text-[var(--color-info)]"
            }`}
          >
            Count
          </button>
        </div>
      </div>

      {isSpreadsheet ? (
        <IngredientSpreadsheet {...spreadsheetProps} />
      ) : (
        <InventoryList {...inventoryListProps} />
      )}
    </div>
  );
}
