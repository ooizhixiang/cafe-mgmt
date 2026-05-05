"use client";

import { useState, useTransition } from "react";
import { setMinMarginPercent } from "@/actions/setup.actions";
import { useToast } from "@/components/ui/toast";

interface Props {
  initialValue: number;
  isManager: boolean;
}

export function MinMarginSettings({ initialValue, isManager }: Props) {
  const [value, setValue] = useState<string>(String(initialValue));
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function handleSave() {
    const previousValue = String(initialValue);
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 99) {
      toast("Margin floor must be a whole number from 0 to 99");
      setValue(previousValue);
      return;
    }
    startTransition(async () => {
      const result = await setMinMarginPercent(parsed);
      if (!result.success) {
        toast(result.error);
        setValue(previousValue);
        return;
      }
      toast("Margin floor saved");
    });
  }

  return (
    <section className="space-y-[var(--space-3)]">
      <div>
        <h2 className="text-value mb-[var(--space-1)]">Minimum Margin</h2>
        <p className="text-meta text-[var(--text-secondary)]">
          The action feed warns about any recipe whose margin falls below this
          floor. 0 means warn only on outright loss; 20 means warn unless at
          least 20% of the selling price is profit.
        </p>
      </div>
      <div className="flex items-center gap-[var(--space-2)]">
        <label
          htmlFor="min-margin-percent"
          className="text-meta text-[var(--text-secondary)] shrink-0"
        >
          Floor (%)
        </label>
        <input
          id="min-margin-percent"
          aria-label="Minimum margin percent"
          type="number"
          step="1"
          min="0"
          max="99"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleSave}
          disabled={!isManager || isPending}
          className="w-20 rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body disabled:opacity-50"
        />
      </div>
    </section>
  );
}
