"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { bulkCreateIngredientPurchases } from "@/actions/inventory.actions";
import { parseRMToCents } from "@/lib/format";
import { useToast } from "@/components/ui/toast";

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

interface Props {
  initialSuppliers: SupplierData[];
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

export function PurchasesForm({ initialSuppliers }: Props) {
  const [supplierId, setSupplierId] = useState<string>("");
  const [lines, setLines] = useState<LineRow[]>(() => [blankLine()]);
  const [isPending, startTransition] = useTransition();
  const submittingRef = useRef(false);
  const { toast } = useToast();

  function lineHasUserData(line: LineRow): boolean {
    return Boolean(
      line.ingredientId || line.quantity || line.totalRM || line.unitPriceTouched
    );
  }

  const currentSupplier = useMemo(
    () => initialSuppliers.find((s) => s.id === supplierId) ?? null,
    [supplierId, initialSuppliers]
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

  function handleIngredientChange(key: string, ingredientId: string) {
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
  }

  function resetForm() {
    setLines([blankLine()]);
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

  if (initialSuppliers.length === 0) {
    return (
      <p className="text-meta text-[var(--text-secondary)]">
        Add a supplier first to log purchases.
      </p>
    );
  }

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
          {initialSuppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* Lines */}
      {supplierId && supplierHasNoLinkedIngredients && (
        <p className="text-meta text-[var(--text-secondary)] rounded border border-[var(--border-default)] p-[var(--space-3)]">
          This supplier has no products yet. Add one in Suppliers.
        </p>
      )}

      {supplierId && !supplierHasNoLinkedIngredients && (
        <div className="space-y-[var(--space-3)]">
          <p className="text-meta font-semibold text-[var(--text-secondary)]">
            Lines
          </p>
          {lines.map((line, idx) => {
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
                    {supplierIngredients.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </div>

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
                    <input
                      type="text"
                      aria-label={`Unit line ${idx + 1}`}
                      value={line.unit}
                      onChange={(e) => handleUnitChange(line.key, e.target.value)}
                      placeholder="kg"
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
      {supplierId && !supplierHasNoLinkedIngredients && (
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
