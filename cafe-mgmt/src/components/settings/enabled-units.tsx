"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  BUILT_IN_UNITS_BY_DIMENSION,
  ALL_BUILT_IN_UNITS,
  validateCustomUnit,
  type UnitDimension,
} from "@/lib/units";
import { setCafeEnabledUnits } from "@/actions/setup.actions";
import { useToast } from "@/components/ui/toast";

interface Props {
  initialEnabledUnits: string[];
  isManager: boolean;
}

const DIMENSION_LABELS: Record<UnitDimension, string> = {
  mass: "Mass",
  volume: "Volume",
  count: "Count",
};

export function EnabledUnitsEditor({ initialEnabledUnits, isManager }: Props) {
  const [enabledUnits, setEnabledUnits] = useState<string[]>(initialEnabledUnits);
  const [customDraft, setCustomDraft] = useState("");
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  // Custom units = anything stored that isn't in the built-in catalog.
  const customUnits = enabledUnits.filter(
    (u) => !ALL_BUILT_IN_UNITS.includes(u)
  );

  function persist(nextList: string[], previousList: string[]) {
    // Optimistic update; rollback on action failure.
    setEnabledUnits(nextList);
    startTransition(async () => {
      const result = await setCafeEnabledUnits(nextList);
      if (!result.success) {
        toast(result.error);
        setEnabledUnits(previousList);
      }
    });
  }

  function toggleBuiltIn(unit: string) {
    const previous = enabledUnits;
    const next = enabledUnits.includes(unit)
      ? enabledUnits.filter((u) => u !== unit)
      : [...enabledUnits, unit];
    persist(next, previous);
  }

  function handleAddCustom() {
    const trimmed = customDraft;
    const validation = validateCustomUnit(trimmed);
    if (!validation.ok) {
      toast(validation.error);
      return;
    }
    if (enabledUnits.includes(validation.normalized)) {
      toast("Unit is already enabled");
      return;
    }
    const previous = enabledUnits;
    persist([...enabledUnits, validation.normalized], previous);
    setCustomDraft("");
  }

  function removeCustom(unit: string) {
    const previous = enabledUnits;
    persist(
      enabledUnits.filter((u) => u !== unit),
      previous
    );
  }

  return (
    <section className="space-y-[var(--space-4)]">
      <div>
        <h2 className="text-value mb-[var(--space-1)]">Units</h2>
        <p className="text-meta text-[var(--text-secondary)]">
          Pick which units staff can choose when logging purchases, ingredients, and supplier prices.
        </p>
      </div>

      {enabledUnits.length === 0 && (
        <p
          role="alert"
          className="rounded border border-[var(--color-urgent)] bg-[var(--color-urgent-bg,rgba(220,38,38,0.08))] p-[var(--space-3)] text-meta text-[var(--color-urgent)]"
        >
          Enable at least one unit so staff can log purchases.
        </p>
      )}

      {(Object.keys(BUILT_IN_UNITS_BY_DIMENSION) as UnitDimension[]).map(
        (dimension) => (
          <div key={dimension}>
            <p className="text-meta font-semibold text-[var(--text-secondary)] mb-[var(--space-2)]">
              {DIMENSION_LABELS[dimension]}
            </p>
            <div className="flex flex-wrap gap-[var(--space-2)]">
              {BUILT_IN_UNITS_BY_DIMENSION[dimension].map((unit) => {
                const checked = enabledUnits.includes(unit);
                return (
                  <label
                    key={unit}
                    className={`inline-flex items-center gap-[var(--space-2)] rounded border px-[var(--space-3)] py-[var(--space-1)] text-meta cursor-pointer ${
                      checked
                        ? "border-[var(--color-info)] bg-[var(--bg-secondary)]"
                        : "border-[var(--border-default)]"
                    } ${!isManager || isPending ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleBuiltIn(unit)}
                      disabled={!isManager || isPending}
                      aria-label={`Enable ${unit}`}
                    />
                    <span>{unit}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )
      )}

      <div>
        <p className="text-meta font-semibold text-[var(--text-secondary)] mb-[var(--space-2)]">
          Custom units
        </p>
        {customUnits.length === 0 && (
          <p className="text-meta text-[var(--text-secondary)] mb-[var(--space-2)]">
            No custom units yet.
          </p>
        )}
        {customUnits.length > 0 && (
          <ul className="space-y-[var(--space-1)] mb-[var(--space-3)]">
            {customUnits.map((unit) => (
              <li
                key={unit}
                className="flex items-center justify-between rounded border border-[var(--border-default)] px-[var(--space-3)] py-[var(--space-1)] text-meta"
              >
                <span>{unit}</span>
                {isManager && (
                  <button
                    type="button"
                    onClick={() => removeCustom(unit)}
                    disabled={isPending}
                    aria-label={`Remove custom unit ${unit}`}
                    className="touch-target p-1 text-[var(--color-urgent)] disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {isManager && (
          <div className="flex gap-[var(--space-2)]">
            <input
              type="text"
              value={customDraft}
              onChange={(e) => setCustomDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddCustom();
                }
              }}
              placeholder="e.g. scoop"
              maxLength={20}
              aria-label="New custom unit"
              className="flex-1 min-h-[44px] rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-[var(--space-2)] py-[var(--space-1)] text-meta"
              disabled={isPending}
            />
            <button
              type="button"
              onClick={handleAddCustom}
              disabled={isPending || customDraft.length === 0}
              className="inline-flex items-center gap-1 rounded bg-[var(--color-info)] px-[var(--space-3)] py-[var(--space-1)] text-meta text-[var(--bg-primary)] disabled:opacity-50"
              aria-label="Add custom unit"
            >
              <Plus size={14} /> Add
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
