"use client";

import { Fragment, useEffect, useMemo, useState, useTransition, useRef } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Lock,
  Star,
  Trash2,
  Unlock,
  X,
} from "lucide-react";
import {
  setManualCostOverride,
  togglePin,
  updateIngredientConfig,
  updateIngredientDisplayUnit,
} from "@/actions/inventory.actions";
import { currentCostPerUnit, findOldestNonEmptyLot } from "@/lib/fifo";
import { compatibleUnits, dimensionOf } from "@/lib/unit-conversion";
import {
  addIngredient,
  deleteIngredient,
  updateIngredient,
} from "@/actions/setup.actions";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  IngredientSuppliersPanel,
  type IngredientPurchaseRow,
  type IngredientSupplierRow,
} from "@/components/ingredients/ingredient-suppliers-panel";
import { InventoryDetailDialog } from "@/components/ingredients/inventory-detail-dialog";
import { UnitPicker } from "@/components/ui/unit-picker";
import { DEFAULT_ENABLED_UNITS } from "@/lib/units";
import { useToast } from "@/components/ui/toast";

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  /**
   * Optional within-dimension display target for the inventory tab. Null = no
   * conversion (parity with pre-feature behavior).
   */
  displayUnit: string | null;
  costPerUnitInCents: number | null;
  /**
   * Cost derived via `currentCostPerUnit` on the server. When
   * `manualCostOverride` is true, this equals the manual cost. When false, it
   * reflects the oldest non-empty lot's per-unit price (or falls back to the
   * manual cost if no lots exist).
   */
  derivedCostPerUnitInCents: number | null;
  snapIncrement: number | null;
  containerProfile: string | null;
  category: string | null;
  lowStockThreshold: number | null;
  unitsPerContainer: number | null;
  sku: string | null;
  barcode: string | null;
  isPinned: boolean;
  manualCostOverride: boolean;
  ingredientSuppliers: IngredientSupplierRow[];
  ingredientPurchases: IngredientPurchaseRow[];
}

interface SupplierOption {
  id: string;
  name: string;
}

type CellField =
  | "name"
  | "unit"
  | "cost"
  | "snap"
  | "container"
  | "category"
  | "threshold"
  | "unitsPerContainer"
  | "sku"
  | "barcode";

const NUMERIC_FIELDS: CellField[] = [
  "cost",
  "snap",
  "threshold",
  "unitsPerContainer",
];

const INTEGER_FIELDS: CellField[] = ["snap", "threshold", "unitsPerContainer"];

function formatCellValue(ingredient: Ingredient, field: CellField): string {
  switch (field) {
    case "name":
      return ingredient.name;
    case "unit":
      return ingredient.unit;
    case "cost": {
      // Show 4 decimals when there's a sub-cent component (e.g., 50 cents
      // stored as 0.5 → "0.0050"), otherwise the familiar 2-decimal form.
      // Preserves the user's original sub-cent input on re-render.
      if (ingredient.costPerUnitInCents == null) return "";
      const cents = ingredient.costPerUnitInCents;
      const dollars = cents / 100;
      const isWholeCent = cents % 1 === 0;
      return dollars.toFixed(isWholeCent ? 2 : 4);
    }
    case "snap":
      return ingredient.snapIncrement?.toString() ?? "";
    case "container":
      return ingredient.containerProfile ?? "";
    case "category":
      return ingredient.category ?? "";
    case "threshold":
      return ingredient.lowStockThreshold?.toString() ?? "";
    case "unitsPerContainer":
      return ingredient.unitsPerContainer?.toString() ?? "";
    case "sku":
      return ingredient.sku ?? "";
    case "barcode":
      return ingredient.barcode ?? "";
  }
}

export function IngredientSpreadsheet({
  initialIngredients,
  suppliers,
  distinctCategories,
  enabledUnits = DEFAULT_ENABLED_UNITS,
}: {
  initialIngredients: Ingredient[];
  suppliers: SupplierOption[];
  distinctCategories: string[];
  enabledUnits?: string[];
}) {
  const [ingredients, setIngredients] = useState<Ingredient[]>(initialIngredients);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Ingredient | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<Ingredient | null>(null);
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set()
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Total visible column count, used by full-row colSpans (empty-state /
  // no-results / expanded-suppliers / add-row placeholders) so they don't
  // over-span the rendered header when advanced columns are hidden.
  const colCount = showAdvanced ? 15 : 9;
  const filterPopoverRef = useRef<HTMLDivElement | null>(null);
  const filterButtonRef = useRef<HTMLButtonElement | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  // Hydrate the advanced-columns toggle from localStorage on mount. Wrapped in
  // try/catch so SSR / private-mode / blocked-storage doesn't crash render.
  useEffect(() => {
    try {
      const v = localStorage.getItem("ingredients.showAdvancedColumns");
      if (v === "true") setShowAdvanced(true);
    } catch {}
  }, []);

  function toggleAdvanced() {
    setShowAdvanced((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(
          "ingredients.showAdvancedColumns",
          String(next)
        );
      } catch {}
      return next;
    });
  }

  // Categories shown in dropdown + popover: union of distinct (server snapshot) +
  // current local ingredient categories + permanent "Unassigned", sorted, deduped.
  // Reactive to local edits so newly-typed categories surface immediately.
  const categoryOptions = useMemo(() => {
    const set = new Set<string>(distinctCategories);
    for (const ing of ingredients) {
      if (ing.category) set.add(ing.category);
    }
    set.add("Unassigned");
    return Array.from(set).sort();
  }, [distinctCategories, ingredients]);

  // Click-outside-to-close for the filter popover (pointerdown catches mouse + touch)
  useEffect(() => {
    if (!filterOpen) return;
    function handle(e: PointerEvent) {
      const target = e.target as Node;
      if (
        filterPopoverRef.current?.contains(target) ||
        filterButtonRef.current?.contains(target)
      ) {
        return;
      }
      setFilterOpen(false);
    }
    document.addEventListener("pointerdown", handle);
    return () => document.removeEventListener("pointerdown", handle);
  }, [filterOpen]);

  // Escape-to-close + focus management for the filter popover.
  useEffect(() => {
    if (!filterOpen) {
      return;
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setFilterOpen(false);
      }
    }
    document.addEventListener("keydown", handleKey);
    // Focus the first checkbox in the popover when it opens.
    const firstCheckbox = filterPopoverRef.current?.querySelector(
      'input[type="checkbox"]'
    ) as HTMLInputElement | null;
    firstCheckbox?.focus();
    return () => {
      document.removeEventListener("keydown", handleKey);
      // Restore focus to the trigger button on close.
      filterButtonRef.current?.focus();
    };
  }, [filterOpen]);

  // Patch 11: Clear stale expandedId if its row is gone
  useEffect(() => {
    if (expandedId && !ingredients.some((i) => i.id === expandedId)) {
      setExpandedId(null);
    }
  }, [ingredients, expandedId]);

  // Prune selectedCategories that no longer exist in categoryOptions to avoid
  // a "0 rows, no recovery" trap after a category is fully removed.
  useEffect(() => {
    setSelectedCategories((prev) => {
      const validCategories = new Set([...categoryOptions]);
      const next = new Set([...prev].filter((c) => validCategories.has(c)));
      return next.size === prev.size ? prev : next;
    });
  }, [categoryOptions]);

  async function handleSaveCell(
    ingredientId: string,
    field: CellField,
    rawValue: string
  ): Promise<boolean> {
    // Look up the row by id at function entry (don't snapshot the whole array)
    const ingredient = ingredients.find((i) => i.id === ingredientId);
    if (!ingredient) {
      toast("Ingredient no longer exists — refresh");
      return false;
    }

    const trimmed = rawValue.trim();

    // Validate numeric fields
    if (NUMERIC_FIELDS.includes(field) && trimmed !== "") {
      // Patch 8: Reject non-integer numeric for integer fields
      if (INTEGER_FIELDS.includes(field) && !Number.isInteger(Number(trimmed))) {
        toast("Whole number required");
        return false;
      }
      const num = field === "cost" ? parseFloat(trimmed) : parseInt(trimmed, 10);
      if (!Number.isFinite(num) || num < 0) {
        toast("Invalid number");
        return false;
      }
    }

    // Name/unit
    if (field === "name" || field === "unit") {
      if (trimmed === "") {
        toast(field === "name" ? "Name is required" : "Unit is required");
        return false;
      }
      const oldName = ingredient.name;
      const oldUnit = ingredient.unit;
      const nextName = field === "name" ? trimmed : oldName;
      const nextUnit = field === "unit" ? trimmed : oldUnit;
      if (nextName === oldName && nextUnit === oldUnit) {
        return true; // no-op
      }
      // Per-row functional optimistic update
      setIngredients((rows) =>
        rows.map((r) =>
          r.id === ingredientId ? { ...r, name: nextName, unit: nextUnit } : r
        )
      );
      const result = await new Promise<{ success: boolean; error?: string }>(
        (resolve) => {
          startTransition(async () => {
            const r = await updateIngredient(ingredientId, nextName, nextUnit);
            resolve(r);
          });
        }
      );
      if (!result.success) {
        // Per-field rollback (functional)
        setIngredients((rows) =>
          rows.map((r) =>
            r.id === ingredientId ? { ...r, name: oldName, unit: oldUnit } : r
          )
        );
        toast(result.error ?? "Save failed");
        return false;
      }
      return true;
    }

    // Config fields — compute next + capture old per-field
    let nextValue:
      | { key: "costPerUnitInCents"; old: number | null; next: number | null }
      | { key: "snapIncrement"; old: number | null; next: number | null }
      | { key: "containerProfile"; old: string | null; next: string | null }
      | { key: "category"; old: string | null; next: string | null }
      | { key: "lowStockThreshold"; old: number | null; next: number | null }
      | { key: "unitsPerContainer"; old: number | null; next: number | null }
      | { key: "sku"; old: string | null; next: string | null }
      | { key: "barcode"; old: string | null; next: string | null };

    switch (field) {
      case "cost": {
        let next: number | null;
        if (trimmed === "") {
          next = null;
        } else {
          const cents = parseFloat(trimmed) * 100;
          // Patch 9: Cost upper bound + finite guard (sub-cent precision allowed)
          if (
            !Number.isFinite(cents) ||
            cents < 0 ||
            cents > 1_000_000_000
          ) {
            toast("Cost out of range");
            return false;
          }
          next = cents;
        }
        nextValue = {
          key: "costPerUnitInCents",
          old: ingredient.costPerUnitInCents,
          next,
        };
        break;
      }
      case "snap": {
        const next = trimmed === "" ? null : parseInt(trimmed, 10);
        if (next !== null && next < 1) {
          toast("Snap must be at least 1");
          return false;
        }
        nextValue = {
          key: "snapIncrement",
          old: ingredient.snapIncrement,
          next,
        };
        break;
      }
      case "container": {
        const next = trimmed === "" ? null : trimmed;
        if (next && next.length > 100) {
          toast("Container profile too long");
          return false;
        }
        nextValue = {
          key: "containerProfile",
          old: ingredient.containerProfile,
          next,
        };
        break;
      }
      case "category": {
        const next = trimmed === "" ? null : trimmed;
        if (next && next.length > 50) {
          toast("Category too long");
          return false;
        }
        nextValue = {
          key: "category",
          old: ingredient.category,
          next,
        };
        break;
      }
      case "threshold": {
        const next = trimmed === "" ? null : parseInt(trimmed, 10);
        nextValue = {
          key: "lowStockThreshold",
          old: ingredient.lowStockThreshold,
          next,
        };
        break;
      }
      case "unitsPerContainer": {
        const next = trimmed === "" ? null : parseInt(trimmed, 10);
        if (next !== null && next < 1) {
          toast("Units per container must be at least 1");
          return false;
        }
        nextValue = {
          key: "unitsPerContainer",
          old: ingredient.unitsPerContainer,
          next,
        };
        break;
      }
      case "sku": {
        const next = trimmed === "" ? null : trimmed;
        if (next && next.length > 100) {
          toast("SKU too long");
          return false;
        }
        nextValue = {
          key: "sku",
          old: ingredient.sku,
          next,
        };
        break;
      }
      case "barcode": {
        const next = trimmed === "" ? null : trimmed;
        if (next && next.length > 100) {
          toast("Barcode too long");
          return false;
        }
        nextValue = {
          key: "barcode",
          old: ingredient.barcode,
          next,
        };
        break;
      }
    }

    // Detect no-op
    if (nextValue.old === nextValue.next) {
      return true;
    }

    // Per-row, per-field optimistic update.
    // Spec B1: editing the cost cell auto-locks (override → true). Track the
    // prior override flag so we can roll back atomically with the cost field.
    const wasOverride = ingredient.manualCostOverride;
    setIngredients((rows) =>
      rows.map((r) => {
        if (r.id !== ingredientId) return r;
        const next: Ingredient = { ...r, [nextValue.key]: nextValue.next } as Ingredient;
        if (nextValue.key === "costPerUnitInCents") {
          next.manualCostOverride = true;
        }
        return next;
      })
    );

    // Cost cell takes a different path so we toggle override + cost atomically
    // server-side. All other fields use updateIngredientConfig as before.
    if (nextValue.key === "costPerUnitInCents") {
      const next = nextValue.next;
      const result = await new Promise<{ success: boolean; error?: string }>(
        (resolve) => {
          startTransition(async () => {
            // Atomic: setManualCostOverride writes the lock flag and the cost
            // (including null = clear) in a single action call. No more
            // two-step "clear then lock" path.
            const r = await setManualCostOverride(ingredientId, true, next);
            resolve(r);
          });
        }
      );

      if (!result.success) {
        // Roll back both fields together
        setIngredients((rows) =>
          rows.map((r) =>
            r.id === ingredientId
              ? { ...r, costPerUnitInCents: nextValue.old, manualCostOverride: wasOverride }
              : r
          )
        );
        toast(result.error ?? "Save failed");
        return false;
      }
      return true;
    }

    // Build partial payload: only the changed field
    const payload: Parameters<typeof updateIngredientConfig>[0] = {
      id: ingredientId,
    };
    switch (nextValue.key) {
      case "snapIncrement":
        payload.snapIncrement = nextValue.next;
        break;
      case "containerProfile":
        payload.containerProfile = nextValue.next;
        break;
      case "category":
        payload.category = nextValue.next;
        break;
      case "lowStockThreshold":
        payload.lowStockThreshold = nextValue.next;
        break;
      case "unitsPerContainer":
        payload.unitsPerContainer = nextValue.next;
        break;
      case "sku":
        payload.sku = nextValue.next;
        break;
      case "barcode":
        payload.barcode = nextValue.next;
        break;
    }

    const result = await new Promise<{ success: boolean; error?: string }>(
      (resolve) => {
        startTransition(async () => {
          const r = await updateIngredientConfig(payload);
          resolve(r);
        });
      }
    );

    if (!result.success) {
      // Per-field functional rollback
      setIngredients((rows) =>
        rows.map((r) =>
          r.id === ingredientId
            ? { ...r, [nextValue.key]: nextValue.old }
            : r
        )
      );
      toast(result.error ?? "Save failed");
      return false;
    }
    // Patch 10: Silent on success for cell saves (no toast)
    return true;
  }

  function handleToggleOverride(ingredient: Ingredient) {
    const wasOverride = ingredient.manualCostOverride;
    const wasDerivedCost = ingredient.derivedCostPerUnitInCents;
    const newOverride = !wasOverride;
    // Recompute the derived cost atomically with the lock flip — otherwise the
    // cell keeps rendering the stale server-rendered value (which equals the
    // manual cost when previously locked, i.e. the visible bug).
    const newDerivedCost = currentCostPerUnit(
      {
        manualCostOverride: newOverride,
        costPerUnitInCents: ingredient.costPerUnitInCents,
      },
      findOldestNonEmptyLot(ingredient.ingredientPurchases)
    );
    // Optimistic flip
    setIngredients((rows) =>
      rows.map((r) =>
        r.id === ingredient.id
          ? {
              ...r,
              manualCostOverride: newOverride,
              derivedCostPerUnitInCents: newDerivedCost,
            }
          : r
      )
    );
    startTransition(async () => {
      const result = await setManualCostOverride(
        ingredient.id,
        newOverride
      );
      if (!result.success) {
        // Roll back both fields
        setIngredients((rows) =>
          rows.map((r) =>
            r.id === ingredient.id
              ? {
                  ...r,
                  manualCostOverride: wasOverride,
                  derivedCostPerUnitInCents: wasDerivedCost,
                }
              : r
          )
        );
        toast(result.error ?? "Failed to update override");
      }
    });
  }

  function handleSaveDisplayUnit(ingredient: Ingredient, next: string | null) {
    // Treat empty string from the <select>'s "(none)" option as null/clear.
    const previous = ingredient.displayUnit;
    const sanitized = next === "" ? null : next;
    if (sanitized === previous) return;
    setIngredients((rows) =>
      rows.map((r) => (r.id === ingredient.id ? { ...r, displayUnit: sanitized } : r))
    );
    startTransition(async () => {
      const result = await updateIngredientDisplayUnit({
        ingredientId: ingredient.id,
        displayUnit: sanitized,
      });
      if (!result.success) {
        toast(result.error);
        setIngredients((rows) =>
          rows.map((r) => (r.id === ingredient.id ? { ...r, displayUnit: previous } : r))
        );
      }
    });
  }

  function handleTogglePin(ingredient: Ingredient) {
    // Patch 4 + 12: Capture only the previous isPinned for the row id, and stable-sort by index
    const wasPinned = ingredient.isPinned;
    setIngredients((rows) => {
      const flipped = rows.map((r) =>
        r.id === ingredient.id ? { ...r, isPinned: !r.isPinned } : r
      );
      // Stable sort by isPinned with original index as tiebreaker
      const indexed = flipped.map((row, idx) => ({ row, idx }));
      indexed.sort((a, b) => {
        if (a.row.isPinned !== b.row.isPinned) {
          return a.row.isPinned ? -1 : 1;
        }
        return a.idx - b.idx;
      });
      return indexed.map((entry) => entry.row);
    });
    startTransition(async () => {
      const result = await togglePin(ingredient.id);
      if (!result.success) {
        // Functional rollback: flip just this row's isPinned back
        setIngredients((rows) => {
          const reverted = rows.map((r) =>
            r.id === ingredient.id ? { ...r, isPinned: wasPinned } : r
          );
          // Re-sort stably to keep pinned-first invariant
          const indexed = reverted.map((row, idx) => ({ row, idx }));
          indexed.sort((a, b) => {
            if (a.row.isPinned !== b.row.isPinned) {
              return a.row.isPinned ? -1 : 1;
            }
            return a.idx - b.idx;
          });
          return indexed.map((entry) => entry.row);
        });
        toast(result.error);
      }
    });
  }

  function handleAdd() {
    // Patch 7: Gate on !isPending to prevent duplicate calls
    if (isPending) return;
    const name = newName.trim();
    const unit = newUnit.trim();
    const category = newCategory;
    // Patch 13: Add-row Enter feedback when fields empty
    if (!name || !unit) {
      toast("Name and unit required");
      return;
    }
    if (!category) {
      toast("Category required");
      return;
    }
    startTransition(async () => {
      const result = await addIngredient(name, unit, category);
      if (!result.success) {
        toast(result.error);
        return;
      }
      setIngredients((prev) => [
        ...prev,
        {
          id: result.data.id,
          name,
          unit,
          displayUnit: null,
          costPerUnitInCents: null,
          derivedCostPerUnitInCents: null,
          snapIncrement: null,
          containerProfile: null,
          category,
          lowStockThreshold: null,
          unitsPerContainer: null,
          sku: null,
          barcode: null,
          isPinned: false,
          manualCostOverride: true,
          ingredientSuppliers: [],
          ingredientPurchases: [],
        },
      ]);
      setNewName("");
      // Intentionally NOT resetting newUnit — managers often add multiple
      // ingredients in the same unit (kg after kg), and a `<select>` with no
      // empty option would visually snap to the first option but leave state
      // at "" (a React-controlled-select trap). Carrying the previous unit
      // forward avoids both the UX trap and the state/DOM mismatch.
      setNewCategory("");
      toast("Ingredient added");
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    startTransition(async () => {
      const result = await deleteIngredient(id);
      if (!result.success) {
        toast(result.error);
        return;
      }
      setIngredients((prev) => prev.filter((i) => i.id !== id));
      if (expandedId === id) setExpandedId(null);
      setDeleteTarget(null);
      toast("Ingredient removed");
    });
  }

  // Filtered visible rows: search by name (case-insensitive substring) AND
  // category set (OR within set). Empty selection = no category filter.
  // Memoized so cell-save re-renders don't re-filter 500+ rows unnecessarily.
  const trimmedSearch = useMemo(
    () => searchQuery.toLowerCase().trim(),
    [searchQuery]
  );
  const visibleIngredients = useMemo(
    () =>
      ingredients.filter((i) => {
        const matchesSearch =
          trimmedSearch === "" || i.name.toLowerCase().includes(trimmedSearch);
        const matchesCategory =
          selectedCategories.size === 0 ||
          selectedCategories.has(i.category ?? "Unassigned");
        return matchesSearch && matchesCategory;
      }),
    [ingredients, trimmedSearch, selectedCategories]
  );

  function clearSearchAndFilter() {
    setSearchQuery("");
    setSelectedCategories(new Set());
    setFilterOpen(false);
  }

  function toggleCategory(cat: string) {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  return (
    <div>
      {/* Sticky search + filter toolbar */}
      <div
        className="sticky top-0 z-[3] bg-[var(--bg-page)] py-[var(--space-2)] flex items-center gap-[var(--space-2)] flex-wrap"
      >
        <div className="relative flex-1 min-w-[180px]">
          <input
            type="text"
            placeholder="Search ingredients"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search ingredients"
            className="w-full min-h-[44px] rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-1 pr-9 text-meta"
          />
          {searchQuery !== "" && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--text-secondary)]"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <div className="relative">
          <button
            ref={filterButtonRef}
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            aria-label={
              selectedCategories.size > 0
                ? `Filter (${selectedCategories.size} selected)`
                : "Filter"
            }
            aria-expanded={filterOpen}
            className="min-h-[44px] rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-1 text-meta font-medium"
          >
            {selectedCategories.size > 0
              ? `Filter (${selectedCategories.size})`
              : "Filter"}
          </button>
          {filterOpen && (
            <div
              ref={filterPopoverRef}
              role="dialog"
              aria-label="Filter by category"
              className="absolute right-0 top-full mt-1 z-[4] min-w-[200px] max-h-[260px] overflow-auto rounded border border-[var(--border-default)] bg-[var(--bg-primary)] py-[var(--space-2)] shadow-lg"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              {categoryOptions.length === 0 && (
                <div className="px-[var(--space-3)] py-[var(--space-2)] text-meta text-[var(--text-secondary)]">
                  No categories
                </div>
              )}
              {categoryOptions.map((cat) => (
                <label
                  key={cat}
                  className="flex items-center gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)] text-meta cursor-pointer hover:bg-[var(--bg-secondary)]"
                >
                  <input
                    type="checkbox"
                    checked={selectedCategories.has(cat)}
                    onChange={() => toggleCategory(cat)}
                    aria-label={`Filter by ${cat}`}
                  />
                  <span>{cat}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={toggleAdvanced}
          aria-pressed={showAdvanced}
          className="text-meta text-[var(--color-info)] font-medium whitespace-nowrap px-[var(--space-2)] py-[var(--space-1)] rounded border border-[var(--border-default)]"
        >
          {showAdvanced ? "− Hide advanced columns" : "+ Show advanced columns"}
        </button>
      </div>

      <div
        className="overflow-x-auto rounded-lg border border-[var(--border-default)]"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <table className="min-w-full text-meta">
          <thead className="bg-[var(--bg-secondary)]">
            <tr>
              <Th className="w-[36px]"> </Th>
              <Th className="w-[40px]" title="Pin">
                <Star size={14} className="inline" />
              </Th>
              <Th sticky className="min-w-[140px]">
                Name
              </Th>
              <Th className="min-w-[80px]">Unit</Th>
              {showAdvanced && (
                <Th className="min-w-[100px]" title="Display unit on the inventory tab (within-dimension conversion only)">
                  Display
                </Th>
              )}
              <Th className="min-w-[70px]">Cost ($)</Th>
              {showAdvanced && <Th className="min-w-[60px]">Snap</Th>}
              {showAdvanced && <Th className="min-w-[140px]">Container</Th>}
              <Th className="min-w-[110px]">Category</Th>
              <Th className="min-w-[80px]">Threshold</Th>
              {showAdvanced && (
                <Th className="min-w-[120px]">Units/container</Th>
              )}
              {showAdvanced && <Th className="min-w-[110px]">SKU</Th>}
              {showAdvanced && <Th className="min-w-[110px]">Barcode</Th>}
              <Th className="min-w-[120px]">Suppliers</Th>
              <Th className="w-[60px]"> </Th>
            </tr>
          </thead>
          <tbody>
            {ingredients.length === 0 && (
              <tr>
                <td
                  colSpan={colCount}
                  className="px-[var(--space-3)] py-[var(--space-4)] text-center text-body text-[var(--text-secondary)]"
                >
                  No ingredients yet. Add your first one below.
                </td>
              </tr>
            )}
            {ingredients.length > 0 && visibleIngredients.length === 0 && (
              <tr>
                <td
                  colSpan={colCount}
                  className="px-[var(--space-3)] py-[var(--space-4)] text-center text-body text-[var(--text-secondary)]"
                >
                  <span>No ingredients match</span>
                  <button
                    type="button"
                    onClick={clearSearchAndFilter}
                    className="ml-[var(--space-2)] rounded border border-[var(--border-default)] px-2 py-1 text-meta font-medium text-[var(--color-info)]"
                  >
                    Clear
                  </button>
                </td>
              </tr>
            )}
            {visibleIngredients.map((ing) => {
              const isExpanded = expandedId === ing.id;
              return (
                <Fragment key={ing.id}>
                  <tr className="border-t border-[var(--border-default)]">
                    <td className="px-[var(--space-2)] py-1 text-center align-middle">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId(isExpanded ? null : ing.id)
                        }
                        className="touch-target p-1 text-[var(--text-secondary)]"
                        aria-label={isExpanded ? "Collapse suppliers" : "Expand suppliers"}
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? (
                          <ChevronDown size={16} />
                        ) : (
                          <ChevronRight size={16} />
                        )}
                      </button>
                    </td>
                    <td className="px-[var(--space-2)] py-1 text-center align-middle">
                      <button
                        type="button"
                        onClick={() => handleTogglePin(ing)}
                        className="touch-target p-1"
                        aria-label={ing.isPinned ? "Unpin" : "Pin"}
                        aria-pressed={ing.isPinned}
                      >
                        <Star
                          size={16}
                          className={
                            ing.isPinned
                              ? "text-[var(--color-warning)] fill-current"
                              : "text-[var(--text-secondary)]"
                          }
                        />
                      </button>
                    </td>
                    {/* Patch 1: Stable cell keys based only on row id + field */}
                    <Cell
                      key={`name:${ing.id}`}
                      ingredient={ing}
                      field="name"
                      sticky
                      onSave={handleSaveCell}
                    />
                    <Cell
                      key={`unit:${ing.id}`}
                      ingredient={ing}
                      field="unit"
                      enabledUnits={enabledUnits}
                      onSave={handleSaveCell}
                    />
                    {showAdvanced && (
                      <td className="px-[var(--space-2)] py-1 align-middle">
                        {(() => {
                          const dim = dimensionOf(ing.unit);
                          if (dim === null) {
                            // Custom storage unit (e.g. "scoop") has no known
                            // dimension — disable conversion picker and tell the
                            // manager why so it doesn't read as a UI bug.
                            return (
                              <span
                                className="text-meta text-[var(--text-secondary)]"
                                title="Display conversion is only available for standard mass / volume / count units"
                              >
                                —
                              </span>
                            );
                          }
                          // Drop the storage unit itself — "(same as unit)" already
                          // covers that case; offering it twice is redundant UX.
                          const options = compatibleUnits(ing.unit).filter(
                            (u) => u !== ing.unit
                          );
                          return (
                            <select
                              aria-label={`Display unit for ${ing.name}`}
                              value={ing.displayUnit ?? ""}
                              onChange={(e) =>
                                handleSaveDisplayUnit(ing, e.target.value)
                              }
                              disabled={isPending}
                              className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1 text-meta disabled:opacity-50"
                            >
                              <option value="">(same as unit)</option>
                              {options.map((u) => (
                                <option key={u} value={u}>
                                  {u}
                                </option>
                              ))}
                            </select>
                          );
                        })()}
                      </td>
                    )}
                    <td className="px-[var(--space-1)] py-1 align-middle">
                      <div className="flex items-center gap-[var(--space-1)]">
                        <button
                          type="button"
                          onClick={() => handleToggleOverride(ing)}
                          disabled={isPending}
                          className="touch-target p-1 text-[var(--text-secondary)] disabled:opacity-30 disabled:cursor-not-allowed"
                          aria-label={
                            ing.manualCostOverride
                              ? `Cost is locked (manual) for ${ing.name}. Click to unlock.`
                              : `Cost is unlocked (auto) for ${ing.name}. Click to lock.`
                          }
                          aria-pressed={ing.manualCostOverride}
                          title={
                            ing.manualCostOverride
                              ? "Manual cost (locked). Click to switch to auto."
                              : "Auto cost (unlocked). Click to lock manually."
                          }
                        >
                          {ing.manualCostOverride ? (
                            <Lock size={14} />
                          ) : (
                            <Unlock size={14} />
                          )}
                        </button>
                        {ing.manualCostOverride ? (
                          <CellInput
                            key={`cost:${ing.id}`}
                            ingredient={ing}
                            field="cost"
                            numeric
                            step="0.01"
                            onSave={handleSaveCell}
                          />
                        ) : (
                          <AutoCostCell
                            ingredient={ing}
                            onLockClick={() => handleToggleOverride(ing)}
                            disabled={isPending}
                          />
                        )}
                      </div>
                    </td>
                    {showAdvanced && (
                      <Cell
                        key={`snap:${ing.id}`}
                        ingredient={ing}
                        field="snap"
                        numeric
                        onSave={handleSaveCell}
                      />
                    )}
                    {showAdvanced && (
                      <Cell
                        key={`container:${ing.id}`}
                        ingredient={ing}
                        field="container"
                        onSave={handleSaveCell}
                      />
                    )}
                    <Cell
                      key={`category:${ing.id}`}
                      ingredient={ing}
                      field="category"
                      onSave={handleSaveCell}
                    />
                    <Cell
                      key={`threshold:${ing.id}`}
                      ingredient={ing}
                      field="threshold"
                      numeric
                      onSave={handleSaveCell}
                    />
                    {showAdvanced && (
                      <Cell
                        key={`upc:${ing.id}`}
                        ingredient={ing}
                        field="unitsPerContainer"
                        numeric
                        onSave={handleSaveCell}
                      />
                    )}
                    {showAdvanced && (
                      <Cell
                        key={`sku:${ing.id}`}
                        ingredient={ing}
                        field="sku"
                        onSave={handleSaveCell}
                      />
                    )}
                    {showAdvanced && (
                      <Cell
                        key={`barcode:${ing.id}`}
                        ingredient={ing}
                        field="barcode"
                        onSave={handleSaveCell}
                      />
                    )}
                    <td className="px-[var(--space-2)] py-1 align-middle">
                      <div className="flex items-center gap-[var(--space-3)]">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId(isExpanded ? null : ing.id)
                          }
                          className="text-meta text-[var(--color-info)] font-medium"
                        >
                          Suppliers ({ing.ingredientSuppliers.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setDetailsTarget(ing)}
                          aria-label={`View inventory details for ${ing.name}`}
                          className="text-meta text-[var(--color-info)] font-medium whitespace-nowrap"
                        >
                          View inventory details
                        </button>
                      </div>
                    </td>
                    <td className="px-[var(--space-2)] py-1 text-center align-middle">
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(ing)}
                        disabled={isPending}
                        className="touch-target p-1 text-[var(--color-urgent)] disabled:opacity-30"
                        aria-label={`Delete ${ing.name}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-t border-[var(--border-default)] bg-[var(--bg-secondary)]">
                      <td
                        colSpan={colCount}
                        className="px-[var(--space-4)] py-[var(--space-3)]"
                      >
                        <IngredientSuppliersPanel
                          ingredientId={ing.id}
                          suppliers={ing.ingredientSuppliers}
                          purchases={ing.ingredientPurchases}
                          allSuppliers={suppliers}
                          mode="manager"
                          enabledUnits={enabledUnits}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {/* Sticky add-row at bottom */}
            <tr className="border-t-2 border-[var(--border-default)] bg-[var(--bg-secondary)]">
              <td className="px-[var(--space-2)] py-1"> </td>
              <td className="px-[var(--space-2)] py-1"> </td>
              {/* Patch 14: Bump add-row sticky z-index to z-[2] to avoid overlap with cell sticky-left */}
              <td
                className="px-[var(--space-2)] py-1 align-middle sticky left-0 bg-[var(--bg-secondary)] z-[2]"
              >
                <input
                  type="text"
                  placeholder="New ingredient name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    // Patch 7: Gate Enter on !isPending
                    if (e.key === "Enter" && !isPending) handleAdd();
                  }}
                  aria-label="New ingredient name"
                  className="w-full min-h-[44px] rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1 text-meta"
                />
              </td>
              <td className="px-[var(--space-2)] py-1 align-middle">
                <UnitPicker
                  value={newUnit}
                  onChange={setNewUnit}
                  enabledUnits={enabledUnits}
                  ariaLabel="New ingredient unit"
                  className="w-full min-h-[44px] rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1 text-meta"
                />
              </td>
              {/* Display unit is configured after adding (needs the row's `unit`
                  to filter compatible options). Placeholder keeps the column
                  count balanced. Hidden when advanced columns are off so the
                  add-row's cell count matches the 9-column header. */}
              {showAdvanced && <td className="px-[var(--space-2)] py-1"> </td>}
              {/* "Configure cost, etc. after adding" placeholder spans Cost (always)
                  + Snap + Container (advanced); colSpan shrinks to 1 when those
                  two columns aren't rendered. */}
              <td
                colSpan={showAdvanced ? 3 : 1}
                className="px-[var(--space-2)] py-1 text-meta text-[var(--text-secondary)]"
              >
                Configure cost, etc. after adding.
              </td>
              <td className="px-[var(--space-2)] py-1 align-middle">
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  aria-label="New ingredient category"
                  className="w-full min-h-[44px] rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1 text-meta"
                >
                  <option value="">Choose category…</option>
                  {categoryOptions.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </td>
              {/* "Set threshold and suppliers next" placeholder spans
                  Threshold (always) + Units/container (advanced) + SKU
                  (advanced) + Barcode (advanced) + Suppliers (always); colSpan
                  is 5 when advanced columns are visible, 2 otherwise. SKU and
                  Barcode can be added per-row after the ingredient is created. */}
              <td
                colSpan={showAdvanced ? 5 : 2}
                className="px-[var(--space-2)] py-1 text-meta text-[var(--text-secondary)]"
              >
                Set threshold and suppliers next.
              </td>
              <td className="px-[var(--space-2)] py-1 text-center align-middle">
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={
                    isPending ||
                    !newName.trim() ||
                    !newUnit.trim() ||
                    !newCategory
                  }
                  className="touch-target p-1 text-[var(--color-success)] disabled:opacity-30"
                  aria-label="Add ingredient"
                >
                  <Check size={18} />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <ConfirmationDialog
        open={!!deleteTarget}
        title="Remove ingredient?"
        message={`Remove "${deleteTarget?.name ?? ""}" from your ingredient list? This cannot be undone.`}
        confirmLabel="Remove"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <InventoryDetailDialog
        open={!!detailsTarget}
        ingredientName={detailsTarget?.name ?? ""}
        ingredientUnit={detailsTarget?.unit ?? ""}
        displayUnit={detailsTarget?.displayUnit ?? null}
        purchases={detailsTarget?.ingredientPurchases ?? []}
        onClose={() => setDetailsTarget(null)}
      />
    </div>
  );
}

function Th({
  children,
  className = "",
  sticky = false,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  sticky?: boolean;
  title?: string;
}) {
  return (
    <th
      title={title}
      className={`text-left text-meta font-semibold text-[var(--text-secondary)] px-[var(--space-2)] py-[var(--space-2)] whitespace-nowrap ${
        sticky ? "sticky left-0 bg-[var(--bg-secondary)] z-[1]" : ""
      } ${className}`}
    >
      {children}
    </th>
  );
}

function Cell({
  ingredient,
  field,
  numeric = false,
  step,
  sticky = false,
  enabledUnits,
  onSave,
}: {
  ingredient: Ingredient;
  field: CellField;
  numeric?: boolean;
  step?: string;
  sticky?: boolean;
  /** Required when `field === "unit"`; ignored otherwise. */
  enabledUnits?: string[];
  // Patch 5: onSave is async and returns Promise<boolean>
  onSave: (id: string, field: CellField, value: string) => Promise<boolean>;
}) {
  return (
    <td
      className={`px-[var(--space-1)] py-1 align-middle ${
        sticky ? "sticky left-0 bg-[var(--bg-primary)] z-[1]" : ""
      }`}
    >
      <CellInput
        ingredient={ingredient}
        field={field}
        numeric={numeric}
        step={step}
        enabledUnits={enabledUnits}
        onSave={onSave}
      />
    </td>
  );
}

function CellInput({
  ingredient,
  field,
  numeric = false,
  step,
  enabledUnits,
  onSave,
}: {
  ingredient: Ingredient;
  field: CellField;
  numeric?: boolean;
  step?: string;
  /** Required when `field === "unit"`; ignored otherwise. */
  enabledUnits?: string[];
  onSave: (id: string, field: CellField, value: string) => Promise<boolean>;
}) {
  const initial = formatCellValue(ingredient, field);
  const [value, setValue] = useState(initial);
  const lastSavedRef = useRef(initial);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setValue(initial);
    lastSavedRef.current = initial;
  }, [initial]);

  async function commit(nextValue: string = value) {
    if (nextValue === lastSavedRef.current) return;
    const attempted = nextValue;
    try {
      const ok = await onSave(ingredient.id, field, attempted);
      if (ok) {
        lastSavedRef.current = attempted.trim();
      } else {
        setValue(lastSavedRef.current);
      }
    } catch {
      setValue(lastSavedRef.current);
    }
  }

  async function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      inputRef.current?.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setValue(lastSavedRef.current);
      setTimeout(() => inputRef.current?.blur(), 0);
    }
  }

  if (field === "unit") {
    // Use the shared <UnitPicker> instead of free-text. Picker change is
    // instant — there's no blur step, so funnel onChange straight through
    // commit() (which still owns the optimistic-update / revert flow).
    return (
      <UnitPicker
        value={value}
        onChange={(next) => {
          setValue(next);
          // Pass `next` directly so commit doesn't race the setState.
          void commit(next);
        }}
        enabledUnits={enabledUnits ?? []}
        ariaLabel={`Unit for ${ingredient.name}`}
        className="w-full min-h-[44px] rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1 text-meta"
      />
    );
  }

  return (
    <input
      ref={inputRef}
      type={numeric ? "number" : "text"}
      step={step}
      min={numeric ? "0" : undefined}
      value={value}
      aria-label={`${field} ${ingredient.name}`}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => commit()}
      onKeyDown={handleKeyDown}
      className="w-full min-h-[44px] rounded border border-transparent bg-transparent px-2 py-1 text-meta hover:border-[var(--border-default)] focus:border-[var(--color-info)] focus:bg-[var(--bg-primary)] outline-none"
    />
  );
}

// Read-only cost cell shown when `manualCostOverride === false`. Displays the
// derived per-unit cost (oldest non-empty lot, or fallback). Clicking it flips
// the lock back on, after which the row re-renders with an editable input.
function AutoCostCell({
  ingredient,
  onLockClick,
  disabled,
}: {
  ingredient: Ingredient;
  onLockClick: () => void;
  disabled: boolean;
}) {
  const cents = ingredient.derivedCostPerUnitInCents;
  const display =
    cents === null
      ? "(Auto) —"
      : `(Auto) $${(cents / 100).toFixed(cents % 1 === 0 ? 2 : 4)}`;
  return (
    <button
      type="button"
      onClick={onLockClick}
      disabled={disabled}
      aria-label={`cost ${ingredient.name} (auto)`}
      title="Auto cost from oldest non-empty lot. Click to switch to manual."
      className="w-full min-h-[44px] rounded border border-transparent bg-transparent px-2 py-1 text-meta text-left text-[var(--text-secondary)] hover:border-[var(--border-default)] disabled:opacity-50"
    >
      {display}
    </button>
  );
}
