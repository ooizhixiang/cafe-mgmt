"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Plus, Trash2, X, Check } from "lucide-react";
import { bulkCreateIngredientPurchases } from "@/actions/inventory.actions";
import { addIngredientSupplier } from "@/actions/setup.actions";
import { parseRMToCents, parseRMToCentsPrecise } from "@/lib/format";
import { useToast } from "@/components/ui/toast";
import { UnitPicker } from "@/components/ui/unit-picker";
import { DEFAULT_ENABLED_UNITS } from "@/lib/units";

export interface SupplierLink {
  id: string;
  ingredientId: string;
  ingredientName: string;
  unit: string;
  priceInCents: number;
}

export interface SupplierData {
  id: string;
  name: string;
  links: SupplierLink[];
}

export interface IngredientOption {
  id: string;
  name: string;
  unit: string;
}

interface Props {
  initialSuppliers: SupplierData[];
  allIngredients?: IngredientOption[];
  /**
   * Cafe-managed unit picker vocabulary. Defaults to the project-wide
   * `DEFAULT_ENABLED_UNITS` so callers (and tests) that don't thread the
   * cafe's actual list still render a usable picker.
   */
  enabledUnits?: string[];
}

interface LineRow {
  key: string;
  ingredientId: string;
  quantity: string;
  unit: string;
  unitPriceRM: string;
  totalRM: string;
  unitPriceTouched: boolean;
  totalTouched: boolean;
}

const ADD_NEW_SENTINEL = "__ADD_NEW__";

let nextKey = 0;
function makeKey(): string {
  nextKey += 1;
  return `line-${nextKey}-${Date.now()}`;
}

function blankLine(): LineRow {
  return {
    key: makeKey(),
    ingredientId: "",
    quantity: "",
    unit: "",
    unitPriceRM: "",
    totalRM: "",
    unitPriceTouched: false,
    totalTouched: false,
  };
}

function priceCentsToRM(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function PurchasesForm({ initialSuppliers, allIngredients = [], enabledUnits = DEFAULT_ENABLED_UNITS }: Props) {
  const [supplierId, setSupplierId] = useState<string>("");
  // Local supplier state so the inline "+ Link new ingredient" mini-form can
  // optimistically insert a fresh link without a page round-trip.
  const [suppliers, setSuppliers] = useState<SupplierData[]>(initialSuppliers);
  const [lines, setLines] = useState<LineRow[]>(() => [blankLine()]);
  const [isPending, startTransition] = useTransition();
  const submittingRef = useRef(false);
  const { toast } = useToast();

  // Keep local supplier state in sync with parent re-renders (e.g. router refresh).
  useEffect(() => {
    setSuppliers(initialSuppliers);
  }, [initialSuppliers]);

  // Per-line "+ Link new ingredient" mini-form state. Only one line can have
  // the mini-form open at a time (matches the supplier-list inline picker UX).
  const [addingForLineKey, setAddingForLineKey] = useState<string | null>(null);
  const [addNewIngredientId, setAddNewIngredientId] = useState<string>("");
  const [addNewPriceRM, setAddNewPriceRM] = useState<string>("");
  const [addNewUnit, setAddNewUnit] = useState<string>("");
  const [addNewSubmitting, setAddNewSubmitting] = useState(false);

  function lineHasUserData(line: LineRow): boolean {
    return Boolean(
      line.ingredientId || line.quantity || line.totalRM || line.unitPriceTouched
    );
  }

  const currentSupplier = useMemo(
    () => suppliers.find((s) => s.id === supplierId) ?? null,
    [supplierId, suppliers]
  );

  const linkByIngredient = useMemo(() => {
    const map = new Map<string, SupplierLink>();
    if (currentSupplier) {
      for (const l of currentSupplier.links) {
        map.set(l.ingredientId, l);
      }
    }
    return map;
  }, [currentSupplier]);

  const supplierIngredients = useMemo(() => {
    if (!currentSupplier) return [];
    return [...currentSupplier.links]
      .map((l) => ({ id: l.ingredientId, name: l.ingredientName, unit: l.unit }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [currentSupplier]);

  // Ingredients that can be linked to this supplier from the mini-form: any
  // cafe ingredient not yet linked to the current supplier.
  const ingredientsAvailableToLink = useMemo(() => {
    if (!currentSupplier) return [] as IngredientOption[];
    const linked = new Set(currentSupplier.links.map((l) => l.ingredientId));
    return allIngredients
      .filter((i) => !linked.has(i.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [currentSupplier, allIngredients]);

  // The set-anywhere-but-not-on-supplier case: no point showing the empty-state
  // banner if at least one cafe ingredient is available to link.
  const supplierHasNoLinkedIngredients =
    Boolean(currentSupplier) && supplierIngredients.length === 0;

  function handleSupplierChange(newId: string) {
    if (newId === supplierId) return;
    if (lines.some(lineHasUserData)) {
      const ok = window.confirm(
        "Changing supplier will clear all current lines. Continue?"
      );
      if (!ok) return;
    }
    setSupplierId(newId);
    setLines([blankLine()]);
    closeAddNew();
  }

  function recomputeTotal(qty: string, unitPriceRM: string): string {
    const qtyNum = parseInt(qty, 10);
    const unitCents = parseRMToCents(unitPriceRM);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0 || unitCents === null || unitCents < 0) {
      return "";
    }
    const totalCents = qtyNum * unitCents;
    return (totalCents / 100).toFixed(2);
  }

  function updateLine(key: string, patch: Partial<LineRow>) {
    setLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, ...patch } : line))
    );
  }

  function applyLinkToLine(line: LineRow, link: SupplierLink): LineRow {
    const next: LineRow = {
      ...line,
      ingredientId: link.ingredientId,
      unit: link.unit,
      unitPriceRM: priceCentsToRM(link.priceInCents),
      unitPriceTouched: false,
      totalTouched: false,
    };
    next.totalRM = recomputeTotal(next.quantity, next.unitPriceRM);
    return next;
  }

  function handleIngredientChange(key: string, ingredientId: string) {
    if (ingredientId === ADD_NEW_SENTINEL) {
      // Open the inline mini-form for this line. Don't commit any ingredient
      // selection on the line yet — wait for the manager to save.
      setAddingForLineKey(key);
      setAddNewIngredientId("");
      setAddNewPriceRM("");
      setAddNewUnit("");
      return;
    }

    const link = linkByIngredient.get(ingredientId);
    const unit = link?.unit ?? "";
    const unitPriceRM = link ? priceCentsToRM(link.priceInCents) : "";
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const next: LineRow = {
          ...line,
          ingredientId,
          unit,
          unitPriceRM,
          unitPriceTouched: false,
          totalTouched: false,
        };
        next.totalRM = recomputeTotal(next.quantity, next.unitPriceRM);
        return next;
      })
    );
  }

  function handleQuantityChange(key: string, value: string) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const next: LineRow = { ...line, quantity: value };
        if (!next.totalTouched) {
          next.totalRM = recomputeTotal(next.quantity, next.unitPriceRM);
        }
        return next;
      })
    );
  }

  function handleUnitPriceChange(key: string, value: string) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const next: LineRow = {
          ...line,
          unitPriceRM: value,
          unitPriceTouched: true,
        };
        if (!next.totalTouched) {
          next.totalRM = recomputeTotal(next.quantity, next.unitPriceRM);
        }
        return next;
      })
    );
  }

  function handleTotalChange(key: string, value: string) {
    updateLine(key, { totalRM: value, totalTouched: true });
  }

  function handleUnitChange(key: string, value: string) {
    updateLine(key, { unit: value });
  }

  function addLine() {
    setLines((prev) => [...prev, blankLine()]);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
    if (addingForLineKey === key) {
      closeAddNew();
    }
  }

  function resetForm() {
    setLines([blankLine()]);
    closeAddNew();
  }

  function closeAddNew() {
    setAddingForLineKey(null);
    setAddNewIngredientId("");
    setAddNewPriceRM("");
    setAddNewUnit("");
    setAddNewSubmitting(false);
  }

  // Mini-form save validity: ingredient picked, price > 0, unit non-empty.
  const addNewPriceCents = useMemo(
    () => parseRMToCentsPrecise(addNewPriceRM),
    [addNewPriceRM]
  );
  const canSaveAddNew =
    Boolean(addNewIngredientId) &&
    addNewPriceCents !== null &&
    addNewPriceCents > 0 &&
    addNewUnit.trim().length > 0;

  async function handleSaveAddNew() {
    if (!supplierId || !addingForLineKey) return;
    if (!canSaveAddNew || addNewPriceCents === null) {
      toast("Fill ingredient, price, and unit");
      return;
    }
    setAddNewSubmitting(true);
    try {
      const result = await addIngredientSupplier({
        supplierId,
        ingredientId: addNewIngredientId,
        priceInCents: addNewPriceCents,
        unit: addNewUnit.trim(),
      });
      if (!result.success) {
        toast(result.error);
        // Keep the mini-form open so the manager can correct (e.g. duplicate).
        setAddNewSubmitting(false);
        return;
      }

      // Build the new link from the action's response + form data.
      const ingredient = allIngredients.find((i) => i.id === addNewIngredientId);
      const newLink: SupplierLink = {
        id: result.data.id,
        ingredientId: addNewIngredientId,
        ingredientName: ingredient?.name ?? "",
        unit: addNewUnit.trim(),
        priceInCents: addNewPriceCents,
      };

      // Optimistically insert into the current supplier's links.
      setSuppliers((prev) =>
        prev.map((s) =>
          s.id === supplierId
            ? {
                ...s,
                links: [...s.links, newLink].sort((a, b) =>
                  a.ingredientName.localeCompare(b.ingredientName)
                ),
              }
            : s
        )
      );

      // Apply the new link to the line that opened the mini-form.
      const lineKey = addingForLineKey;
      setLines((prev) =>
        prev.map((line) => (line.key === lineKey ? applyLinkToLine(line, newLink) : line))
      );

      closeAddNew();
    } finally {
      setAddNewSubmitting(false);
    }
  }

  function handleSubmit() {
    if (submittingRef.current || isPending) return;
    if (!supplierId) {
      toast("Pick a supplier");
      return;
    }
    if (lines.length < 1) {
      toast("Add at least one line");
      return;
    }

    // Build payload, validating each line
    const seen = new Set<string>();
    type Payload = {
      ingredientId: string;
      ingredientSupplierId: string;
      quantity: number;
      unit: string;
      totalPriceInCents: number;
    };
    const payload: Payload[] = [];

    for (const line of lines) {
      const link = linkByIngredient.get(line.ingredientId);
      if (!line.ingredientId || !link) {
        toast("Pick an ingredient for every line");
        return;
      }
      const ingredientName = link.ingredientName;
      if (seen.has(line.ingredientId)) {
        toast(`${ingredientName} appears twice — combine the lines`);
        return;
      }
      seen.add(line.ingredientId);

      const qty = parseInt(line.quantity, 10);
      if (!Number.isFinite(qty) || qty <= 0) {
        toast(`Enter a quantity for ${ingredientName}`);
        return;
      }
      const unit = line.unit.trim();
      if (!unit) {
        toast(`Set a unit for ${ingredientName}`);
        return;
      }
      const totalPriceInCents = parseRMToCents(line.totalRM);
      if (totalPriceInCents === null || totalPriceInCents < 0) {
        toast(`Enter a total for ${ingredientName}`);
        return;
      }

      payload.push({
        ingredientId: line.ingredientId,
        ingredientSupplierId: link.id,
        quantity: qty,
        unit,
        totalPriceInCents,
      });
    }

    submittingRef.current = true;
    startTransition(async () => {
      try {
        const result = await bulkCreateIngredientPurchases({
          supplierId,
          lines: payload,
        });
        if (!result.success) {
          toast(result.error);
          return;
        }
        toast(`${result.data.ids.length} purchase(s) logged`);
        resetForm();
      } finally {
        submittingRef.current = false;
      }
    });
  }

  if (suppliers.length === 0) {
    return (
      <p className="text-meta text-[var(--text-secondary)]">
        Add a supplier first to log purchases.
      </p>
    );
  }

  // The "+ Link new ingredient" sentinel only makes sense when we have at
  // least one cafe ingredient that isn't yet linked to the supplier.
  const canShowAddNewSentinel =
    Boolean(currentSupplier) && ingredientsAvailableToLink.length > 0;

  // When the supplier has no linked products yet but we have ingredients
  // available, allow the manager to start with the mini-form directly.
  const showEmptyStateWithAdd =
    supplierHasNoLinkedIngredients && ingredientsAvailableToLink.length > 0;

  return (
    <div className="space-y-[var(--space-4)]">
      {/* Supplier picker */}
      <div>
        <label className="text-meta text-[var(--text-secondary)] block mb-[var(--space-1)]">
          Supplier
        </label>
        <select
          aria-label="Supplier"
          value={supplierId}
          onChange={(e) => handleSupplierChange(e.target.value)}
          className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
        >
          <option value="">Choose…</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* Empty state — supplier has no linked products */}
      {supplierId && supplierHasNoLinkedIngredients && !showEmptyStateWithAdd && (
        <p className="text-meta text-[var(--text-secondary)] rounded border border-[var(--border-default)] p-[var(--space-3)]">
          This supplier has no products yet. Add one in Suppliers.
        </p>
      )}

      {supplierId && showEmptyStateWithAdd && (
        <p className="text-meta text-[var(--text-secondary)] rounded border border-[var(--border-default)] p-[var(--space-3)]">
          This supplier has no products yet. Use{" "}
          <span className="font-medium">+ Link new ingredient</span> on a line
          to link one.
        </p>
      )}

      {/* Lines */}
      {supplierId && (!supplierHasNoLinkedIngredients || showEmptyStateWithAdd) && (
        <div className="space-y-[var(--space-3)]">
          <p className="text-meta font-semibold text-[var(--text-secondary)]">
            Lines
          </p>
          {lines.map((line, idx) => {
            const isAddingHere = addingForLineKey === line.key;
            return (
              <div
                key={line.key}
                className="rounded border border-[var(--border-default)] p-[var(--space-2)] space-y-[var(--space-2)]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-meta font-medium text-[var(--text-secondary)]">
                    Line {idx + 1}
                  </span>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      aria-label="Remove line"
                      className="touch-target p-1 text-[var(--color-urgent,#dc2626)]"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                <div>
                  <label className="text-meta text-[var(--text-secondary)] block mb-0.5">
                    Ingredient
                  </label>
                  <select
                    aria-label={`Ingredient line ${idx + 1}`}
                    value={line.ingredientId}
                    onChange={(e) =>
                      handleIngredientChange(line.key, e.target.value)
                    }
                    className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
                  >
                    <option value="">Choose…</option>
                    {canShowAddNewSentinel && (
                      <option value={ADD_NEW_SENTINEL}>
                        + Link new ingredient…
                      </option>
                    )}
                    {supplierIngredients.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Inline mini-form for "+ Link new ingredient" */}
                {isAddingHere && (
                  <div
                    data-testid={`add-link-form-${idx + 1}`}
                    className="rounded border border-dashed border-[var(--border-default)] p-[var(--space-2)] space-y-[var(--space-2)]"
                  >
                    <div>
                      <label
                        htmlFor={`add-new-ing-${line.key}`}
                        className="text-meta text-[var(--text-secondary)] block mb-0.5"
                      >
                        Ingredient
                      </label>
                      <select
                        id={`add-new-ing-${line.key}`}
                        aria-label={`New ingredient line ${idx + 1}`}
                        value={addNewIngredientId}
                        onChange={(e) => setAddNewIngredientId(e.target.value)}
                        className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-meta"
                      >
                        <option value="">Choose…</option>
                        {ingredientsAvailableToLink.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-[var(--space-2)]">
                      <div>
                        <label
                          htmlFor={`add-new-price-${line.key}`}
                          className="text-meta text-[var(--text-secondary)] block mb-0.5"
                        >
                          Price (RM)
                        </label>
                        <input
                          id={`add-new-price-${line.key}`}
                          aria-label={`New ingredient price line ${idx + 1}`}
                          type="number"
                          step="0.01"
                          min="0"
                          value={addNewPriceRM}
                          onChange={(e) => setAddNewPriceRM(e.target.value)}
                          placeholder="0.00"
                          className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-meta"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`add-new-unit-${line.key}`}
                          className="text-meta text-[var(--text-secondary)] block mb-0.5"
                        >
                          Unit
                        </label>
                        <UnitPicker
                          id={`add-new-unit-${line.key}`}
                          value={addNewUnit}
                          onChange={setAddNewUnit}
                          enabledUnits={enabledUnits}
                          ariaLabel={`New ingredient unit line ${idx + 1}`}
                          className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-meta"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-[var(--space-2)]">
                      <button
                        type="button"
                        onClick={closeAddNew}
                        aria-label={`Cancel link new ingredient line ${idx + 1}`}
                        className="rounded-lg border border-[var(--border-default)] px-3 py-1 text-meta"
                      >
                        <X size={14} className="inline" /> Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveAddNew}
                        disabled={!canSaveAddNew || addNewSubmitting}
                        aria-label={`Save new ingredient line ${idx + 1}`}
                        className="rounded-lg bg-[var(--color-info)] px-3 py-1 text-meta font-medium text-white disabled:opacity-50"
                      >
                        <Check size={14} className="inline" /> Save
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-[var(--space-2)]">
                  <div>
                    <label className="text-meta text-[var(--text-secondary)] block mb-0.5">
                      Quantity
                    </label>
                    <input
                      type="number"
                      min="1"
                      aria-label={`Quantity line ${idx + 1}`}
                      value={line.quantity}
                      onChange={(e) =>
                        handleQuantityChange(line.key, e.target.value)
                      }
                      className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
                    />
                  </div>
                  <div>
                    <label className="text-meta text-[var(--text-secondary)] block mb-0.5">
                      Unit
                    </label>
                    <UnitPicker
                      value={line.unit}
                      onChange={(v) => handleUnitChange(line.key, v)}
                      enabledUnits={enabledUnits}
                      ariaLabel={`Unit line ${idx + 1}`}
                      className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-[var(--space-2)]">
                  <div>
                    <label className="text-meta text-[var(--text-secondary)] block mb-0.5">
                      Unit price (RM)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      aria-label={`Unit price line ${idx + 1}`}
                      value={line.unitPriceRM}
                      onChange={(e) =>
                        handleUnitPriceChange(line.key, e.target.value)
                      }
                      placeholder="0.00"
                      className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
                    />
                  </div>
                  <div>
                    <label className="text-meta text-[var(--text-secondary)] block mb-0.5">
                      Total (RM)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      aria-label={`Total line ${idx + 1}`}
                      value={line.totalRM}
                      onChange={(e) => handleTotalChange(line.key, e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
                    />
                  </div>
                </div>
              </div>
            );
          })}

          <button
            type="button"
            onClick={addLine}
            className="flex items-center gap-1 text-meta text-[var(--color-info)] font-medium"
          >
            <Plus size={14} /> Add line
          </button>
        </div>
      )}

      {/* Submit */}
      {supplierId && (!supplierHasNoLinkedIngredients || showEmptyStateWithAdd) && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="rounded-lg bg-[var(--color-info)] px-4 py-2 text-body font-medium text-white disabled:opacity-50"
          >
            {isPending ? "Logging…" : "Log purchases"}
          </button>
        </div>
      )}
    </div>
  );
}
