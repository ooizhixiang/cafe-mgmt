"use client";

import { useState, useTransition } from "react";
import { logWastage } from "@/actions/wastage.actions";
import { formatCents } from "@/lib/format";
import { useToast } from "@/components/ui/toast";
import { useUndoToast } from "@/components/providers/undo-toast-provider";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { parseOverDeductionError } from "@/lib/lot-consume";
import { Droplets, CalendarClock, CircleX } from "lucide-react";

interface Ingredient {
  id: string;
  name: string;
  unit: string;
}

const REASONS = [
  { value: "SPILLED" as const, label: "Spilled", icon: Droplets },
  { value: "EXPIRED" as const, label: "Expired", icon: CalendarClock },
  { value: "INCORRECT" as const, label: "Incorrect", icon: CircleX },
];

export function WastageLogger({ ingredients, stockMap: initialStockMap = {} }: { ingredients: Ingredient[]; stockMap?: Record<string, number> }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [reason, setReason] = useState<"SPILLED" | "EXPIRED" | "INCORRECT" | null>(null);
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const [localStock, setLocalStock] = useState<Record<string, number>>(initialStockMap);
  const [overDeductDialog, setOverDeductDialog] = useState<{
    availableQty: number;
    requestedQty: number;
  } | null>(null);
  const { toast } = useToast();
  const { addUndoToast } = useUndoToast();

  function reset() {
    setStep(1);
    setReason(null);
    setSelectedIngredient(null);
    setQuantity(1);
    setSearch("");
  }

  function performLog(confirmOverDeduction: boolean) {
    if (!reason || !selectedIngredient) return;

    startTransition(async () => {
      const result = await logWastage({
        ingredientId: selectedIngredient.id,
        quantity,
        reason,
        confirmOverDeduction,
      });

      if (!result.success) {
        const overDed = parseOverDeductionError(result.error);
        if (overDed) {
          setOverDeductDialog(overDed);
          return;
        }
        if (result.error === "NO_LOTS_RECORDED") {
          toast(
            "This ingredient has no purchase history — log a purchase or set a manual cost first."
          );
          return;
        }
        toast(result.error);
        return;
      }
      const msg = `${formatCents(result.data.dollarValueInCents)} wastage logged`;
      addUndoToast({
        id: result.data.id,
        message: `${selectedIngredient.name}: ${result.data.previousQty ?? "?"} ${selectedIngredient.unit} → ${result.data.newQty ?? "?"} ${selectedIngredient.unit}`,
        type: "wastage",
      });
      // Deduct from local stock so the cap stays accurate
      setLocalStock((prev) => {
        const current = prev[selectedIngredient.id];
        if (current === undefined) return prev;
        return { ...prev, [selectedIngredient.id]: Math.max(0, current - quantity) };
      });
      toast(msg);
      setOverDeductDialog(null);
      reset();
      window.dispatchEvent(new Event("wastage-updated"));
    });
  }

  function handleSubmit() {
    performLog(false);
  }

  const filteredIngredients = ingredients.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="rounded-lg p-[var(--space-4)]" style={{ boxShadow: "var(--shadow-card)" }}>
      <h3 className="text-body font-semibold mb-[var(--space-3)]">Log Wastage</h3>

      {/* Step 1: Select reason */}
      {step === 1 && (
        <div className="grid grid-cols-3 gap-[var(--space-3)]">
          {REASONS.map((r) => (
            <button
              key={r.value}
              onClick={() => {
                setReason(r.value);
                setStep(2);
              }}
              className="touch-target flex flex-col items-center gap-[var(--space-2)] rounded-lg border border-[var(--border-default)] p-[var(--space-4)] text-body active:scale-[0.97] active:bg-[var(--bg-secondary)]"
              style={{ boxShadow: "var(--shadow-sm)" }}
            >
              <r.icon size={28} strokeWidth={1.5} className="text-[var(--text-secondary)]" />
              <span className="font-medium">{r.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Step 2: Select ingredient */}
      {step === 2 && (
        <div>
          <input
            type="text"
            placeholder="Search ingredients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-body mb-[var(--space-2)]"
            autoFocus
          />
          <div className="max-h-[200px] overflow-y-auto space-y-[var(--space-1)]">
            {filteredIngredients.map((ing) => (
              <button
                key={ing.id}
                onClick={() => {
                  setSelectedIngredient(ing);
                  setStep(3);
                }}
                className="w-full text-left rounded-lg px-3 py-2 text-body hover:bg-[var(--bg-secondary)]"
              >
                {ing.name} <span className="text-meta text-[var(--text-secondary)]">({ing.unit})</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => setStep(1)}
            className="mt-[var(--space-2)] text-meta text-[var(--text-secondary)]"
          >
            ← Back
          </button>
        </div>
      )}

      {/* Step 3: Quantity + confirm */}
      {step === 3 && selectedIngredient && (() => {
        const available = localStock[selectedIngredient.id] ?? null;
        const maxQty = available ?? 999;
        return (
        <div>
          <p className="text-body mb-[var(--space-2)]">
            {reason} — {selectedIngredient.name}
          </p>
          {available !== null && (
            <p className="text-meta text-[var(--text-secondary)] mb-[var(--space-2)]">
              In stock: {available}
            </p>
          )}

          <div className="flex items-center gap-[var(--space-3)] mb-[var(--space-3)]">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              disabled={quantity <= 1}
              className="touch-target flex size-[44px] items-center justify-center rounded-lg border border-[var(--border-default)] text-value font-bold disabled:opacity-30"
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
                if (!isNaN(v) && v >= 1) setQuantity(Math.min(maxQty, v));
                else if (raw === "") setQuantity(1);
              }}
              onFocus={(e) => e.target.select()}
              autoComplete="off"
              className="w-12 text-center text-headline bg-[var(--bg-primary)] border-b border-[var(--border-default)] focus:border-[var(--color-info)] outline-none"
            />
            <button
              onClick={() => setQuantity(Math.min(maxQty, quantity + 1))}
              disabled={quantity >= maxQty}
              className="touch-target flex size-[44px] items-center justify-center rounded-lg border border-[var(--border-default)] text-value font-bold disabled:opacity-30"
            >
              +
            </button>
          </div>

          {/* Quick amounts */}
          <div className="flex gap-[var(--space-2)] mb-[var(--space-3)]">
            {[1, 2, 5].filter((n) => n <= maxQty).map((n) => (
              <button
                key={n}
                onClick={() => setQuantity(n)}
                className={`rounded-full px-3 py-1 text-meta ${
                  quantity === n
                    ? "bg-[var(--color-info)] text-white"
                    : "bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
                }`}
              >
                {n}
              </button>
            ))}
          </div>

          <div className="flex gap-[var(--space-2)]">
            <button
              onClick={() => setStep(2)}
              className="flex-1 rounded-lg border border-[var(--border-default)] px-3 py-2 text-body"
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={isPending}
              className="flex-1 rounded-lg bg-[var(--color-urgent,#dc2626)] px-3 py-2 text-body font-medium text-white disabled:opacity-50"
            >
              {isPending ? "Logging..." : "Log Wastage"}
            </button>
          </div>
        </div>
        );
      })()}

      <ConfirmationDialog
        open={overDeductDialog !== null}
        title="Stock will be over-deducted"
        message={
          overDeductDialog
            ? overDeductDialog.availableQty === 0
              ? `No lot stock remaining. Logging ${overDeductDialog.requestedQty} will record the excess at the most-recent-lot's price.`
              : `Stock available: ${overDeductDialog.availableQty}, requested: ${overDeductDialog.requestedQty}. Continue anyway? Excess will be recorded at most-recent-lot's price.`
            : ""
        }
        confirmLabel="Continue"
        destructive
        onConfirm={() => performLog(true)}
        onCancel={() => setOverDeductDialog(null)}
      />
    </div>
  );
}
