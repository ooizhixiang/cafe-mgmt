"use client";

import { useState, useTransition } from "react";
import { logComp } from "@/actions/comp.actions";
import { formatCents } from "@/lib/format";
import { useToast } from "@/components/ui/toast";
import { useUndoToast } from "@/components/providers/undo-toast-provider";

interface Ingredient {
  id: string;
  name: string;
  unit: string;
}

export function CompLogger({ ingredients }: { ingredients: Ingredient[] }) {
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const { addUndoToast } = useUndoToast();

  function reset() {
    setSelectedIngredient(null);
    setQuantity(1);
    setReason("");
    setSearch("");
  }

  function handleSubmit() {
    if (!selectedIngredient || !reason.trim()) return;

    startTransition(async () => {
      const result = await logComp({
        ingredientId: selectedIngredient.id,
        quantity,
        reason: reason.trim(),
      });

      if (!result.success) {
        toast(result.error);
        return;
      }
      addUndoToast({
        id: result.data.id,
        message: `Complimentary: ${selectedIngredient.name} x${quantity}`,
        type: "comp",
      });
      const budgetMsg = result.data.budgetRemainingInCents !== null
        ? ` (${formatCents(result.data.budgetRemainingInCents)} remaining)`
        : "";
      toast(`${formatCents(result.data.dollarValueInCents)} complimentary logged${budgetMsg}`);
      reset();
      window.dispatchEvent(new Event("comp-updated"));
    });
  }

  const filteredIngredients = ingredients.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  if (!selectedIngredient) {
    return (
      <div className="rounded-lg p-[var(--space-4)]" style={{ boxShadow: "var(--shadow-card)" }}>
        <h3 className="text-body font-semibold mb-[var(--space-3)]">Log Complimentary</h3>
        <input
          type="text"
          placeholder="Search ingredients..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-body mb-[var(--space-2)]"
        />
        <div className="max-h-[200px] overflow-y-auto space-y-[var(--space-1)]">
          {filteredIngredients.map((ing) => (
            <button
              key={ing.id}
              onClick={() => setSelectedIngredient(ing)}
              className="w-full text-left rounded-lg px-3 py-2 text-body hover:bg-[var(--bg-secondary)]"
            >
              {ing.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg p-[var(--space-4)]" style={{ boxShadow: "var(--shadow-card)" }}>
      <h3 className="text-body font-semibold mb-[var(--space-3)]">
        Log Complimentary — {selectedIngredient.name}
      </h3>

      <div className="flex items-center gap-[var(--space-3)] mb-[var(--space-3)]">
        <button
          onClick={() => setQuantity(Math.max(1, quantity - 1))}
          className="touch-target flex size-[44px] items-center justify-center rounded-lg border border-[var(--border-default)] text-value font-bold"
        >
          −
        </button>
        <input
          type="text"
          inputMode="numeric"
          value={String(quantity)}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9]/g, "");
            const v = parseInt(raw);
            if (!isNaN(v) && v >= 1) setQuantity(Math.min(999, v));
            else if (raw === "") setQuantity(1);
          }}
          onFocus={(e) => e.target.select()}
          autoComplete="off"
          className="w-12 text-center text-headline bg-[var(--bg-primary)] border-b border-[var(--border-default)] focus:border-[var(--color-info)] outline-none"
        />
        <button
          onClick={() => setQuantity(quantity + 1)}
          className="touch-target flex size-[44px] items-center justify-center rounded-lg border border-[var(--border-default)] text-value font-bold"
        >
          +
        </button>
      </div>

      <input
        type="text"
        placeholder="Reason for comp..."
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-body mb-[var(--space-3)]"
      />

      <div className="flex gap-[var(--space-2)]">
        <button
          onClick={reset}
          className="flex-1 rounded-lg border border-[var(--border-default)] px-3 py-2.5 text-body active:scale-[0.97]"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={isPending || !reason.trim()}
          className="flex-1 rounded-lg bg-[var(--color-info)] px-3 py-2.5 text-body font-medium text-white disabled:opacity-50 active:scale-[0.97]"
        >
          {isPending ? "Logging..." : "Log Complimentary"}
        </button>
      </div>
    </div>
  );
}
