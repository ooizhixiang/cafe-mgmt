"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { saveInventoryCount, bulkConfirmUnchanged, updateIngredientConfig, getRecipesForIngredient } from "@/actions/inventory.actions";
import { addIngredient, updateIngredient, deleteIngredient } from "@/actions/setup.actions";
import { formatCents } from "@/lib/format";
import { StaleValueDialog } from "./stale-value-dialog";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useToast } from "@/components/ui/toast";
import { UnitPicker } from "@/components/ui/unit-picker";
import {
  convert,
  formatConvertedQuantity,
} from "@/lib/unit-conversion";
import { Minus, Plus, Check, Pencil, Trash2, Star, List } from "lucide-react";
import {
  IngredientSuppliersPanel,
  type IngredientSupplierRow,
  type IngredientPurchaseRow,
} from "@/components/ingredients/ingredient-suppliers-panel";
import { RecipesUsingDialog } from "./recipes-using-dialog";

interface IngredientCount {
  id: string;
  name: string;
  unit: string;
  /**
   * Optional manager-set display unit (within-dimension). When non-null,
   * inventory rows render quantities converted into this unit. Storage stays
   * in `unit` everywhere else.
   */
  displayUnit: string | null;
  category: string | null;
  isPinned: boolean;
  snapIncrement: number | null;
  containerProfile: string | null;
  costPerUnitInCents: number | null;
  /**
   * Derived per-unit cost (oldest non-empty lot, or fallback). Spec B2 — used
   * for the per-row cost line so the displayed price tracks lot prices when
   * the manual override is off.
   */
  derivedCostPerUnitInCents: number | null;
  unitsPerContainer: number | null;
  lowStockThreshold: number | null;
  ingredientSuppliers: IngredientSupplierRow[];
  ingredientPurchases: IngredientPurchaseRow[];
  todayCount: number | null;
  todayUpdatedAt: string | null;
  previousCount: number | null;
}

interface SupplierOption {
  id: string;
  name: string;
}

function QuantityStepper({
  value,
  step,
  min,
  max,
  onConfirm,
  disabled,
}: {
  value: number;
  step: number;
  min: number;
  max: number;
  onConfirm: (val: number) => void;
  disabled?: boolean;
}) {
  const [current, setCurrent] = useState(value);
  const [inputText, setInputText] = useState(String(value));
  const [baseValue, setBaseValue] = useState(value);
  const isDirty = current !== baseValue;

  useEffect(() => {
    setCurrent(value);
    setInputText(String(value));
    setBaseValue(value);
  }, [value]);

  function adjust(delta: number) {
    const next = Math.max(min, Math.min(max, current + delta));
    setCurrent(next);
    setInputText(String(next));
  }

  return (
    <div className="flex items-center gap-[var(--space-2)]">
      <button
        type="button"
        onClick={() => adjust(-step)}
        disabled={disabled || current <= min}
        className="touch-target flex size-10 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)] active:bg-[var(--bg-pressed)] disabled:opacity-30"
        aria-label="Decrease"
      >
        <Minus size={18} />
      </button>

      <div className="min-w-[60px] text-center">
        <input
          type="text"
          inputMode="numeric"
          value={inputText}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9]/g, "");
            setInputText(raw);
            const v = parseInt(raw);
            if (!isNaN(v)) setCurrent(Math.max(min, Math.min(max, v)));
            else setCurrent(0);
          }}
          onBlur={() => setInputText(String(current))}
          autoComplete="off"
          disabled={disabled}
          className={`${max >= 1000 ? "w-20" : "w-14"} text-center text-value font-semibold tabular-nums bg-[var(--bg-primary)] border-b border-[var(--border-default)] focus:border-[var(--color-info)] outline-none py-0.5`}
        />
      </div>

      <button
        type="button"
        onClick={() => adjust(step)}
        disabled={disabled || current >= max}
        className="touch-target flex size-10 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)] active:bg-[var(--bg-pressed)] disabled:opacity-30"
        aria-label="Increase"
      >
        <Plus size={18} />
      </button>

      {isDirty && (
        <button
          type="button"
          onClick={() => onConfirm(current)}
          disabled={disabled}
          className="touch-target flex size-10 items-center justify-center rounded-lg bg-[var(--color-info)] text-white active:scale-95 disabled:opacity-50"
          aria-label="Save"
        >
          <Check size={18} />
        </button>
      )}
    </div>
  );
}

export function InventoryList({
  initialIngredients,
  suppliers,
  userRole,
  enabledUnits = [],
}: {
  initialIngredients: IngredientCount[];
  suppliers: SupplierOption[];
  userRole: "MANAGER" | "STAFF";
  enabledUnits?: string[];
}) {
  const isManager = userRole === "MANAGER";
  const [ingredients, setIngredients] = useState(initialIngredients);
  const [filter, setFilter] = useState<string>("all");
  const [isPending, startTransition] = useTransition();
  const [staleDialog, setStaleDialog] = useState<{
    ingredientId: string;
    ingredientName: string;
    currentValue: number;
    currentUpdatedAt: string;
    myValue: number;
  } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    unit: "",
    costPerUnitInCents: "",
    lowStockThreshold: "",
  });
  const [deleteTarget, setDeleteTarget] = useState<IngredientCount | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  // Empty initial value triggers UnitPicker's "Select unit…" placeholder so
  // there's no silent state/DOM mismatch with the rendered <select>.
  const [newUnit, setNewUnit] = useState("");
  const [search, setSearch] = useState("");
  const [expandedIngId, setExpandedIngId] = useState<string | null>(null);
  const [showSuppliersFor, setShowSuppliersFor] = useState<string | null>(null);
  const [recipesDialogIng, setRecipesDialogIng] = useState<{ id: string; name: string; unit: string } | null>(null);
  const [recipesDialogList, setRecipesDialogList] = useState<Array<{ id: string; name: string; quantityPerServing: number; variationName: string | null }>>([]);
  const [recipesDialogLoading, setRecipesDialogLoading] = useState(false);
  // Monotonic id used to discard stale `getRecipesForIngredient` responses
  // when the user clicks "Recipes" on a different ingredient before the
  // first request resolves. Without this, A's response can land on B's dialog.
  const recipesDialogReqRef = useRef(0);
  // Per-ingredient request counter for inline unit changes. Lets us suppress
  // a stale revert when a later change has already been issued — without it,
  // a failing earlier request could clobber a successful later optimistic
  // update.
  const unitChangeReqRef = useRef<Map<string, number>>(new Map());
  const { toast } = useToast();

  const categories = [
    "all",
    ...new Set(ingredients.map((i) => i.category).filter(Boolean)),
  ] as string[];

  const filtered = ingredients.filter((i) => {
    const matchesCategory = filter === "all" || i.category === filter;
    const matchesSearch = !search || i.name.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const unchangedIds = ingredients
    .filter((i) => i.todayCount === null && i.previousCount !== null)
    .map((i) => i.id);

  function handleInlineUnitChange(ing: IngredientCount, newUnit: string) {
    if (newUnit === ing.unit) return;
    const previousUnit = ing.unit;
    const reqId = (unitChangeReqRef.current.get(ing.id) ?? 0) + 1;
    unitChangeReqRef.current.set(ing.id, reqId);
    // Optimistic update
    setIngredients((prev) =>
      prev.map((i) => (i.id === ing.id ? { ...i, unit: newUnit } : i))
    );
    startTransition(async () => {
      let result: { success: true } | { success: false; error: string };
      try {
        result = await updateIngredient(ing.id, ing.name, newUnit);
      } catch {
        result = { success: false, error: "Failed to update unit" };
      }
      // Suppress stale reverts: only act if this is still the latest request
      // for this ingredient. A later change may have superseded us.
      if (unitChangeReqRef.current.get(ing.id) !== reqId) return;
      if (!result.success) {
        toast(result.error || "Failed to update unit");
        setIngredients((prev) =>
          prev.map((i) => (i.id === ing.id ? { ...i, unit: previousUnit } : i))
        );
      }
    });
  }

  function startEdit(ing: IngredientCount) {
    setEditingId(ing.id);
    setEditForm({
      name: ing.name,
      unit: ing.unit,
      costPerUnitInCents: ing.costPerUnitInCents ? (Math.floor(ing.costPerUnitInCents) / 100).toFixed(2) : "",
      lowStockThreshold: ing.lowStockThreshold?.toString() ?? "",
    });
  }

  function handleSaveEdit(id: string) {
    const ing = ingredients.find((i) => i.id === id);
    if (!ing || !editForm.name.trim() || !editForm.unit.trim()) return;

    startTransition(async () => {
      // Update name/unit if changed
      if (editForm.name !== ing.name || editForm.unit !== ing.unit) {
        const r = await updateIngredient(id, editForm.name.trim(), editForm.unit.trim());
        if (!r.success) { toast(r.error); return; }
      }

      // Update config (cost, threshold, supplier)
      const costInCents = editForm.costPerUnitInCents
        ? parseFloat(editForm.costPerUnitInCents) * 100
        : null;
      if (costInCents !== null && !Number.isFinite(costInCents)) {
        toast("Invalid cost");
        return;
      }
      const threshold = editForm.lowStockThreshold
        ? parseInt(editForm.lowStockThreshold)
        : null;

      const r2 = await updateIngredientConfig({
        id,
        costPerUnitInCents: costInCents,
        lowStockThreshold: threshold,
      });
      if (!r2.success) { toast(r2.error); return; }

      setIngredients((prev) =>
        prev.map((i) =>
          i.id === id
            ? {
                ...i,
                name: editForm.name.trim(),
                unit: editForm.unit.trim(),
                costPerUnitInCents: costInCents,
                lowStockThreshold: threshold,
              }
            : i
        )
      );
      setEditingId(null);
      toast("Ingredient updated");
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    startTransition(async () => {
      const result = await deleteIngredient(id);
      if (!result.success) { toast(result.error); return; }
      setIngredients((prev) => prev.filter((i) => i.id !== id));
      setDeleteTarget(null);
      toast("Ingredient removed");
    });
  }

  function handleSave(ingredientId: string, quantity: number) {
    const ing = ingredients.find((i) => i.id === ingredientId);
    if (!ing) return;

    startTransition(async () => {
      const result = await saveInventoryCount({
        ingredientId,
        quantity,
        expectedUpdatedAt: ing.todayUpdatedAt ?? undefined,
      });

      if (!result.success) {
        toast(result.error);
        return;
      }

      if (result.data.stale) {
        setStaleDialog({
          ingredientId,
          ingredientName: ing.name,
          currentValue: result.data.currentValue!,
          currentUpdatedAt: result.data.currentUpdatedAt!,
          myValue: quantity,
        });
        return;
      }

      const dollarMsg = result.data.dollarValueInCents
        ? ` (${formatCents(result.data.dollarValueInCents)} change)`
        : "";
      toast(`${ing.name} updated to ${quantity}${dollarMsg}`);

      setIngredients((prev) =>
        prev.map((i) =>
          i.id === ingredientId
            ? { ...i, todayCount: quantity, todayUpdatedAt: new Date().toISOString() }
            : i
        )
      );
    });
  }

  function handleBulkConfirm() {
    if (unchangedIds.length === 0) return;
    startTransition(async () => {
      const result = await bulkConfirmUnchanged({ ingredientIds: unchangedIds });
      if (result.success) {
        toast(`${result.data?.confirmed ?? 0} items confirmed unchanged`);
        setIngredients((prev) =>
          prev.map((i) =>
            unchangedIds.includes(i.id) && i.previousCount !== null
              ? { ...i, todayCount: i.previousCount, todayUpdatedAt: new Date().toISOString() }
              : i
          )
        );
      } else {
        toast(result.error);
      }
    });
  }

  function handleStaleAccept() {
    if (!staleDialog) return;
    setIngredients((prev) =>
      prev.map((i) =>
        i.id === staleDialog.ingredientId
          ? {
              ...i,
              todayCount: staleDialog.currentValue,
              todayUpdatedAt: staleDialog.currentUpdatedAt,
            }
          : i
      )
    );
    setStaleDialog(null);
  }

  function handleStaleOverride() {
    if (!staleDialog) return;
    startTransition(async () => {
      await saveInventoryCount({
        ingredientId: staleDialog.ingredientId,
        quantity: staleDialog.myValue,
        expectedUpdatedAt: staleDialog.currentUpdatedAt,
      });
      setIngredients((prev) =>
        prev.map((i) =>
          i.id === staleDialog.ingredientId
            ? { ...i, todayCount: staleDialog.myValue, todayUpdatedAt: new Date().toISOString() }
            : i
        )
      );
      setStaleDialog(null);
    });
  }

  return (
    <div className="space-y-[var(--space-3)]">
      {/* Search */}
      {ingredients.length > 0 && (
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ingredients..."
          className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-body focus-ring"
        />
      )}

      {/* Category filter */}
      {categories.length > 1 && (
        <div className="flex gap-[var(--space-2)] overflow-x-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-meta font-medium transition-all ${
                filter === cat
                  ? "bg-[var(--color-info)] text-white shadow-sm"
                  : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] active:bg-[var(--bg-pressed)]"
              }`}
            >
              {cat === "all" ? "All" : cat}
            </button>
          ))}
        </div>
      )}

      {/* Bulk confirm */}
      {unchangedIds.length > 0 && (
        <button
          onClick={handleBulkConfirm}
          disabled={isPending}
          className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)] p-[var(--space-3)] text-body font-medium text-[var(--color-info)] disabled:opacity-50"
        >
          Confirm All Unchanged ({unchangedIds.length})
        </button>
      )}

      {/* No results */}
      {ingredients.length > 0 && filtered.length === 0 && (
        <p className="text-body text-[var(--text-secondary)] text-center py-[var(--space-4)]">
          No ingredients matching {search ? `"${search}"` : "this filter"}
        </p>
      )}

      {/* Ingredient cards */}
      <div className="space-y-[var(--space-3)] lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
      {filtered.map((ing) => {
        const displayValue = ing.todayCount ?? ing.previousCount ?? 0;
        const isConfirmed = ing.todayCount !== null;
        const step = ing.snapIncrement ?? (ing.unit === "%" ? 5 : 1);
        const liquidUnits = ["ml", "l", "oz", "fl oz", "cl"];
        const isLiquid = liquidUnits.includes((ing.unit ?? "").toLowerCase());
        const max = ing.unit === "%" ? 100 : isLiquid ? 10000 : 999;
        const isLow =
          ing.lowStockThreshold !== null && displayValue <= ing.lowStockThreshold;
        const isEditing = editingId === ing.id;

        return (
          <div
            key={ing.id}
            className={`rounded-lg border p-[var(--space-4)] transition-all ${
              isLow
                ? "border-[var(--color-warning)]/60 bg-[var(--color-warning)]/5"
                : isConfirmed
                  ? "border-[var(--color-success)]/30 bg-[var(--color-success)]/5"
                  : "border-[var(--border-default)] bg-[var(--bg-primary)]"
            }`}
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            {isEditing ? (
              /* ── Edit mode ── */
              <div className="space-y-[var(--space-2)]">
                <div className="grid grid-cols-3 gap-[var(--space-2)]">
                  <div className="col-span-2">
                    <label className="text-meta text-[var(--text-secondary)] block mb-0.5">Name</label>
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-meta text-[var(--text-secondary)] block mb-0.5">Unit</label>
                    <input
                      type="text"
                      value={editForm.unit}
                      onChange={(e) => setEditForm((f) => ({ ...f, unit: e.target.value }))}
                      className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-[var(--space-2)]">
                  <div>
                    <label className="text-meta text-[var(--text-secondary)] block mb-0.5">Price per unit ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editForm.costPerUnitInCents}
                      onChange={(e) => setEditForm((f) => ({ ...f, costPerUnitInCents: e.target.value }))}
                      placeholder="0.00"
                      className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
                    />
                  </div>
                  <div>
                    <label className="text-meta text-[var(--text-secondary)] block mb-0.5">Low stock threshold</label>
                    <input
                      type="number"
                      min="0"
                      value={editForm.lowStockThreshold}
                      onChange={(e) => setEditForm((f) => ({ ...f, lowStockThreshold: e.target.value }))}
                      placeholder="e.g. 10"
                      className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-[var(--space-1)]">
                  <button
                    onClick={() => setDeleteTarget(ing)}
                    className="flex items-center gap-1 text-meta text-[var(--color-urgent)] font-medium"
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                  <div className="flex items-center gap-[var(--space-2)]">
                    <button
                      onClick={() => setEditingId(null)}
                      className="rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-meta font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSaveEdit(ing.id)}
                      disabled={isPending || !editForm.name.trim() || !editForm.unit.trim()}
                      className="rounded-lg bg-[var(--color-info)] px-4 py-1.5 text-meta font-medium text-white disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* ── View mode ── */
              <>
                {/* Row 1: Name + actions */}
                <div className="flex items-center justify-between mb-[var(--space-1)]">
                  <div className="flex items-center gap-[var(--space-2)] min-w-0">
                    {ing.isPinned && (
                      <Star size={14} className="text-[var(--color-warning)] shrink-0 fill-current" />
                    )}
                    <button
                      className="text-body font-semibold truncate hover:text-[var(--color-info)] text-left"
                      onClick={() => {
                        if (expandedIngId === ing.id) {
                          setExpandedIngId(null);
                        } else {
                          setExpandedIngId(ing.id);
                        }
                      }}
                    >
                      {ing.name}
                    </button>
                    {isManager ? (
                      <UnitPicker
                        value={ing.unit}
                        onChange={(newUnit) => handleInlineUnitChange(ing, newUnit)}
                        enabledUnits={enabledUnits}
                        disabled={isPending}
                        ariaLabel={`Unit for ${ing.name}`}
                        className="text-meta text-[var(--text-secondary)] bg-transparent border border-[var(--border-default)] rounded px-1 py-0 disabled:opacity-50"
                      />
                    ) : (
                      <span className="text-meta text-[var(--text-secondary)]">({ing.unit})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-[var(--space-1)] shrink-0">
                    {isConfirmed && (
                      <span className="text-meta text-[var(--color-success)] font-medium mr-[var(--space-1)]">
                        Counted
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        const reqId = ++recipesDialogReqRef.current;
                        // Reset list now so stale results from a prior open don't
                        // briefly render under the new ingredient's title.
                        setRecipesDialogList([]);
                        setRecipesDialogIng({ id: ing.id, name: ing.name, unit: ing.unit });
                        setRecipesDialogLoading(true);
                        const r = await getRecipesForIngredient(ing.id);
                        // Discard if a later click superseded this request.
                        if (reqId !== recipesDialogReqRef.current) return;
                        if (r.success) {
                          setRecipesDialogList(r.data);
                        } else {
                          toast(r.error);
                          setRecipesDialogIng(null);
                        }
                        setRecipesDialogLoading(false);
                      }}
                      className="touch-target px-[var(--space-1)] py-1 text-meta text-[var(--color-info)] font-medium flex items-center gap-1"
                      aria-label={`View recipes using ${ing.name}`}
                    >
                      <List size={14} />
                      <span>Recipes</span>
                    </button>
                    <button
                      onClick={() => startEdit(ing)}
                      className="touch-target p-1 text-[var(--text-secondary)]"
                      aria-label="Edit ingredient"
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                </div>

                {/* Row 2: Price, threshold, category */}
                <div className="flex flex-wrap gap-x-[var(--space-3)] gap-y-0.5 mb-[var(--space-2)]">
                  {ing.derivedCostPerUnitInCents !== null && (
                    <span className="text-meta text-[var(--text-secondary)]">
                      {formatCents(ing.derivedCostPerUnitInCents)}/{ing.unit}
                    </span>
                  )}
                  {ing.category && (
                    <span className="text-meta text-[var(--text-secondary)]">
                      {ing.category}
                    </span>
                  )}
                  {isLow && (
                    <span className="text-meta text-[var(--color-warning)] font-medium">
                      Low stock (threshold: {ing.lowStockThreshold} {ing.unit})
                    </span>
                  )}
                </div>

                {/* Row 2.5: Inline supplier chips (max 3 + "+N more") — sorted by price asc to match IngredientSuppliersPanel */}
                {ing.ingredientSuppliers.length > 0 && (() => {
                  const sorted = [...ing.ingredientSuppliers].sort(
                    (a, b) => a.priceInCents - b.priceInCents
                  );
                  const visible = sorted.slice(0, 3);
                  const overflow = sorted.length - visible.length;
                  return (
                    <div
                      className="flex flex-wrap gap-1 mb-[var(--space-2)]"
                      data-testid={`inline-supplier-chips-${ing.id}`}
                    >
                      {visible.map((s) => (
                        <span
                          key={s.id}
                          className="text-meta rounded-full bg-[var(--bg-secondary,#f3f4f6)] px-2 py-0.5 text-[var(--text-secondary)] max-w-[8rem] truncate"
                          title={s.supplierName}
                        >
                          {s.supplierName}
                        </span>
                      ))}
                      {overflow > 0 && (
                        <span
                          aria-label={`${overflow} more supplier${overflow === 1 ? "" : "s"}`}
                          className="text-meta rounded-full bg-[var(--bg-secondary,#f3f4f6)] px-2 py-0.5 text-[var(--text-secondary)]"
                        >
                          +{overflow} more
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* Display-unit hint: show the converted amount when the
                    manager has set a per-ingredient display unit. The stepper
                    below stays in the storage unit so increments remain integer-
                    safe; this line gives the manager the at-a-glance number
                    they actually wanted to see. */}
                {ing.displayUnit && ing.displayUnit !== ing.unit && (() => {
                  const converted = convert(displayValue, ing.unit, ing.displayUnit);
                  if (converted === null) {
                    return (
                      <p className="text-meta text-[var(--text-secondary)] mb-[var(--space-1)]">
                        ≈ — (check display unit)
                      </p>
                    );
                  }
                  return (
                    <p
                      className="text-meta text-[var(--text-secondary)] mb-[var(--space-1)]"
                      aria-label={`Converted display value`}
                    >
                      ≈ {formatConvertedQuantity(converted)} {ing.displayUnit}
                    </p>
                  );
                })()}

                {/* Row 3: Stepper */}
                <QuantityStepper
                  value={displayValue}
                  step={step}
                  min={0}
                  max={max}
                  onConfirm={(val) => handleSave(ing.id, val)}
                  disabled={isPending}
                />

                {/* Row 5: Suppliers (keep row-expansion mechanism for this sub-feature) */}
                {expandedIngId === ing.id && (
                  <div className="mt-[var(--space-2)] pt-[var(--space-2)] border-t border-[var(--border-default)]">
                    <button
                      type="button"
                      onClick={() =>
                        setShowSuppliersFor(
                          showSuppliersFor === ing.id ? null : ing.id
                        )
                      }
                      className="text-meta text-[var(--color-info)] font-medium"
                    >
                      {showSuppliersFor === ing.id
                        ? "Hide all suppliers"
                        : "Show all suppliers"}
                    </button>
                    {showSuppliersFor === ing.id && (
                      <div className="mt-[var(--space-2)]">
                        <IngredientSuppliersPanel
                          ingredientId={ing.id}
                          suppliers={ing.ingredientSuppliers}
                          purchases={ing.ingredientPurchases}
                          allSuppliers={suppliers}
                          mode={isManager ? "manager" : "readonly"}
                          enabledUnits={enabledUnits}
                        />
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
      </div>

      {/* Delete confirmation */}
      <ConfirmationDialog
        open={!!deleteTarget}
        title="Remove ingredient?"
        message={`Remove "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Remove"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Add ingredient */}
      {showAdd && (
        <div className="rounded-lg border border-dashed border-[var(--border-default)] p-[var(--space-3)] space-y-[var(--space-2)]">
          <div className="grid grid-cols-3 gap-[var(--space-2)]">
            <div className="col-span-2">
              <input
                type="text"
                placeholder="Name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
                autoFocus
              />
            </div>
            <div>
              <UnitPicker
                value={newUnit}
                onChange={setNewUnit}
                enabledUnits={enabledUnits}
                ariaLabel="New ingredient unit"
                className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
              />
            </div>
          </div>
          <div className="flex justify-end gap-[var(--space-2)]">
            <button
              onClick={() => { setShowAdd(false); setNewName(""); setNewUnit(""); }}
              className="rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-meta font-medium"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (!newName.trim() || !newUnit.trim()) return;
                startTransition(async () => {
                  const result = await addIngredient(newName.trim(), newUnit.trim(), "Unassigned");
                  if (!result.success) { toast(result.error); return; }
                  setIngredients((prev) => [...prev, {
                    id: result.data.id,
                    name: newName.trim(),
                    unit: newUnit.trim(),
                    displayUnit: null,
                    category: "Unassigned",
                    isPinned: false,
                    snapIncrement: null,
                    containerProfile: null,
                    costPerUnitInCents: null,
                    derivedCostPerUnitInCents: null,
                    unitsPerContainer: null,
                    lowStockThreshold: null,
                    ingredientSuppliers: [],
                    ingredientPurchases: [],
                    todayCount: null,
                    todayUpdatedAt: null,
                    previousCount: null,
                  }]);
                  setNewName("");
                  setNewUnit("");
                  setShowAdd(false);
                  toast("Ingredient added");
                });
              }}
              disabled={isPending || !newName.trim() || !newUnit.trim()}
              className="rounded-lg bg-[var(--color-info)] px-4 py-1.5 text-meta font-medium text-white disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Floating add button */}
      {!showAdd && (
        <button
          onClick={() => setShowAdd(true)}
          className="fixed bottom-[calc(56px+env(safe-area-inset-bottom,0px)+var(--space-4))] right-[var(--space-4)] z-40 flex size-14 items-center justify-center rounded-full bg-[var(--color-info)] text-white active:scale-95 lg:bottom-8 lg:right-8"
          style={{ boxShadow: "var(--shadow-fab)" }}
          aria-label="Add ingredient"
        >
          <Plus size={24} />
        </button>
      )}

      {/* Stale value dialog */}
      {staleDialog && (
        <StaleValueDialog
          ingredientName={staleDialog.ingredientName}
          currentValue={staleDialog.currentValue}
          myValue={staleDialog.myValue}
          onAcceptCurrent={handleStaleAccept}
          onUseMine={handleStaleOverride}
          onClose={() => setStaleDialog(null)}
        />
      )}

      {/* Recipes-using dialog */}
      <RecipesUsingDialog
        open={recipesDialogIng !== null}
        ingredientName={recipesDialogIng?.name ?? ""}
        ingredientUnit={recipesDialogIng?.unit ?? ""}
        loading={recipesDialogLoading}
        recipes={recipesDialogList}
        onClose={() => {
          setRecipesDialogIng(null);
          setRecipesDialogList([]);
        }}
      />
    </div>
  );
}
