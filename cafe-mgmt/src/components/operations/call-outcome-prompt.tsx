"use client";

import { useMemo, useState } from "react";
import { PackageCheck, PhoneOff, PhoneForwarded } from "lucide-react";

export interface IngredientSupplierChoice {
  id: string;
  ingredientId: string;
  ingredientName: string;
  unit: string;
  priceInCents: number;
  /** True if this supplier is already linked to this ingredient. */
  linkedToSupplier: boolean;
}

export type CallOutcome = "ORDERED" | "NO_ANSWER" | "CALL_BACK";

export interface PurchasePayload {
  ingredientSupplierId: string;
  quantity: number;
  unit: string;
  totalPriceInCents: number;
}

interface CallOutcomePromptProps {
  /** Ingredient ↔ supplier links available to pick. Prefer linked-to-this-supplier first. */
  ingredientChoices: IngredientSupplierChoice[];
  onSelect: (outcome: CallOutcome, purchase?: PurchasePayload) => void;
  onClose: () => void;
}

const OUTCOMES = [
  { value: "ORDERED" as const, label: "Ordered", icon: PackageCheck },
  { value: "NO_ANSWER" as const, label: "No Answer", icon: PhoneOff },
  { value: "CALL_BACK" as const, label: "Call Back", icon: PhoneForwarded },
];

export function CallOutcomePrompt({
  ingredientChoices,
  onSelect,
  onClose,
}: CallOutcomePromptProps) {
  const [pendingOutcome, setPendingOutcome] = useState<CallOutcome | null>(null);
  const [choiceId, setChoiceId] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("kg");
  const [total, setTotal] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Prefer choices linked to this supplier; fall back to all when none linked.
  const orderedChoices = useMemo(() => {
    const linked = ingredientChoices.filter((c) => c.linkedToSupplier);
    if (linked.length > 0) return linked;
    return ingredientChoices;
  }, [ingredientChoices]);

  function handleOutcomeClick(outcome: CallOutcome) {
    if (outcome === "ORDERED") {
      setPendingOutcome("ORDERED");
      setError(null);
      // Pre-select first choice + its unit if available
      if (orderedChoices.length > 0 && !choiceId) {
        setChoiceId(orderedChoices[0].id);
        setUnit(orderedChoices[0].unit);
      }
      return;
    }
    onSelect(outcome);
  }

  function handleSaveWithPurchase() {
    if (!choiceId) {
      setError("Choose an ingredient");
      return;
    }
    const choice = orderedChoices.find((c) => c.id === choiceId);
    if (!choice || !choice.linkedToSupplier) {
      setError(
        "Link this ingredient to the supplier first (via Inventory > Show all suppliers)"
      );
      return;
    }
    const qtyNum = parseInt(qty, 10);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      setError("Enter a quantity");
      return;
    }
    const unitTrim = unit.trim();
    if (!unitTrim) {
      setError("Unit required");
      return;
    }
    const totalNum = parseFloat(total);
    if (!Number.isFinite(totalNum) || totalNum < 0) {
      setError("Enter a valid total");
      return;
    }
    setError(null);
    onSelect("ORDERED", {
      ingredientSupplierId: choiceId,
      quantity: qtyNum,
      unit: unitTrim,
      totalPriceInCents: Math.round(totalNum * 100),
    });
  }

  function handleSkipPurchase() {
    onSelect("ORDERED");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm p-[var(--space-4)] animate-[fadeIn_0.15s_ease-out]">
      <div className="w-full max-w-[480px] rounded-t-2xl bg-[var(--bg-primary)] p-[var(--space-5)]" style={{ boxShadow: "var(--shadow-lg)" }}>
        <h3 className="text-body font-semibold mb-[var(--space-3)] text-center">
          How did the call go?
        </h3>

        <div className="grid grid-cols-3 gap-[var(--space-3)]">
          {OUTCOMES.map((o) => {
            const isPending = pendingOutcome === o.value;
            return (
              <button
                key={o.value}
                onClick={() => handleOutcomeClick(o.value)}
                className={`touch-target flex flex-col items-center gap-[var(--space-2)] rounded-lg border p-[var(--space-3)] active:scale-[0.97] active:bg-[var(--bg-secondary)] ${
                  isPending
                    ? "border-[var(--color-info)] bg-[var(--color-info)]/10"
                    : "border-[var(--border-default)]"
                }`}
                style={{ boxShadow: "var(--shadow-sm)" }}
              >
                <o.icon size={28} strokeWidth={1.5} className="text-[var(--text-secondary)]" />
                <span className="text-meta font-medium">{o.label}</span>
              </button>
            );
          })}
        </div>

        {pendingOutcome === "ORDERED" && (
          <div className="mt-[var(--space-4)] space-y-[var(--space-2)]">
            <div>
              <label className="text-meta text-[var(--text-secondary)] block mb-0.5">
                Ingredient
              </label>
              <select
                value={choiceId}
                onChange={(e) => {
                  const id = e.target.value;
                  setChoiceId(id);
                  const c = orderedChoices.find((x) => x.id === id);
                  if (c) setUnit(c.unit);
                }}
                className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
              >
                <option value="">Choose…</option>
                {orderedChoices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.ingredientName}
                    {!c.linkedToSupplier ? " (unlinked)" : ""}
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
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
                />
              </div>
              <div>
                <label className="text-meta text-[var(--text-secondary)] block mb-0.5">
                  Unit
                </label>
                <input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
                />
              </div>
            </div>
            <div>
              <label className="text-meta text-[var(--text-secondary)] block mb-0.5">
                Total (RM)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                placeholder="0.00"
                className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
              />
            </div>
            {error && (
              <p className="text-meta text-[var(--color-urgent,#dc2626)]">{error}</p>
            )}
            <div className="flex flex-col gap-[var(--space-2)] pt-[var(--space-1)]">
              <button
                type="button"
                onClick={handleSaveWithPurchase}
                className="rounded-lg bg-[var(--color-info)] px-3 py-2 text-body font-medium text-white"
              >
                Save with purchase
              </button>
              <button
                type="button"
                onClick={handleSkipPurchase}
                className="rounded-lg border border-[var(--border-default)] px-3 py-2 text-body font-medium text-[var(--text-secondary)]"
              >
                Skip — log call only
              </button>
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full mt-[var(--space-3)] rounded-lg border border-[var(--border-default)] px-3 py-2.5 text-body font-medium text-[var(--text-secondary)] active:bg-[var(--bg-secondary)]"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
