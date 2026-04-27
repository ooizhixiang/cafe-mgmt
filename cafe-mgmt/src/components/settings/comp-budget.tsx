"use client";

import { useState, useTransition } from "react";
import { updateCompBudget } from "@/actions/comp.actions";
import { useToast } from "@/components/ui/toast";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function CompBudgetSettings({
  initialBudget,
}: {
  initialBudget: { amountInCents: number; resetDay: number } | null;
}) {
  const [amount, setAmount] = useState(
    initialBudget ? (initialBudget.amountInCents / 100).toFixed(2) : ""
  );
  const [resetDay, setResetDay] = useState(initialBudget?.resetDay ?? 1);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function handleSave() {
    const dollars = parseFloat(amount);
    if (isNaN(dollars) || dollars <= 0) {
      toast("Enter a valid budget amount");
      return;
    }

    startTransition(async () => {
      const result = await updateCompBudget({
        amountInCents: Math.round(dollars * 100),
        resetDay,
      });
      if (!result.success) {
        toast(result.error);
        return;
      }
      toast("Comp budget updated");
    });
  }

  return (
    <div className="space-y-[var(--space-3)]">
      <div>
        <label className="text-meta text-[var(--text-secondary)] block mb-1">
          Weekly Budget ($)
        </label>
        <input
          type="number"
          step="0.01"
          min="0"
          placeholder="100.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-body"
        />
      </div>

      <div>
        <label className="text-meta text-[var(--text-secondary)] block mb-1">
          Reset Day
        </label>
        <select
          value={resetDay}
          onChange={(e) => setResetDay(Number(e.target.value))}
          className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-body"
        >
          {DAYS.map((day, i) => (
            <option key={i} value={i}>
              {day}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={handleSave}
        disabled={isPending}
        className="w-full rounded-lg bg-[var(--color-info)] px-3 py-2 text-body font-medium text-white disabled:opacity-50"
      >
        {isPending ? "Saving..." : "Save Budget"}
      </button>
    </div>
  );
}
