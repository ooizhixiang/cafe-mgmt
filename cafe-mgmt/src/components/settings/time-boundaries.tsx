"use client";

import { useState, useTransition } from "react";
import { updateTimeBoundaries } from "@/actions/settings.actions";
import { useToast } from "@/components/ui/toast";
import { DEFAULT_TIME_BOUNDARIES } from "@/lib/format";
import { Button } from "@/components/ui/button";

// Generate 30-minute increment options in HH:mm format
const TIME_OPTIONS: { value: string; label: string }[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 30]) {
    const hh = h.toString().padStart(2, "0");
    const mm = m.toString().padStart(2, "0");
    const value = `${hh}:${mm}`;
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const ampm = h < 12 ? "AM" : "PM";
    const label = `${hour12}:${mm.padStart(2, "0")} ${ampm}`;
    TIME_OPTIONS.push({ value, label });
  }
}

interface TimeBoundariesProps {
  initialValues: {
    openingStart: string | null;
    openingEnd: string | null;
    midDayStart: string | null;
    midDayEnd: string | null;
    closingStart: string | null;
    closingEnd: string | null;
  };
}

export function TimeBoundaries({ initialValues }: TimeBoundariesProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const defaults = DEFAULT_TIME_BOUNDARIES;

  const [values, setValues] = useState({
    openingStart: initialValues.openingStart ?? defaults.openingStart,
    openingEnd: initialValues.openingEnd ?? defaults.openingEnd,
    midDayStart: initialValues.midDayStart ?? defaults.midDayStart,
    midDayEnd: initialValues.midDayEnd ?? defaults.midDayEnd,
    closingStart: initialValues.closingStart ?? defaults.closingStart,
    closingEnd: initialValues.closingEnd ?? defaults.closingEnd,
  });

  function handleChange(field: string, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Client-side validation
    if (values.openingStart >= values.openingEnd) {
      setError("Opening: end time must be after start time");
      return;
    }
    if (values.midDayStart >= values.midDayEnd) {
      setError("Mid-Day: end time must be after start time");
      return;
    }
    if (values.closingStart >= values.closingEnd) {
      setError("Closing: end time must be after start time");
      return;
    }
    if (values.openingEnd !== values.midDayStart) {
      setError("Opening end time must match Mid-Day start time");
      return;
    }
    if (values.midDayEnd !== values.closingStart) {
      setError("Mid-Day end time must match Closing start time");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      Object.entries(values).forEach(([key, val]) => formData.set(key, val));

      const result = await updateTimeBoundaries(formData);
      if (result.success) {
        toast("Time boundaries saved");
      } else {
        setError(result.error);
      }
    });
  }

  const periods = [
    { label: "Opening", startKey: "openingStart", endKey: "openingEnd" },
    { label: "Mid-Day", startKey: "midDayStart", endKey: "midDayEnd" },
    { label: "Closing", startKey: "closingStart", endKey: "closingEnd" },
  ] as const;

  return (
    <form onSubmit={handleSubmit} className="space-y-[var(--space-4)]">
      {periods.map((period) => (
        <div key={period.label}>
          <p className="text-meta font-medium text-[var(--text-primary)] mb-[var(--space-2)]">
            {period.label}
          </p>
          <div className="flex gap-[var(--space-3)] items-center">
            <div className="flex-1">
              <label
                htmlFor={period.startKey}
                className="text-meta text-[var(--text-secondary)] block mb-1"
              >
                Start
              </label>
              <select
                id={period.startKey}
                value={values[period.startKey]}
                onChange={(e) =>
                  handleChange(period.startKey, e.target.value)
                }
                className="w-full rounded-md border border-[var(--border-default)] px-3 py-2 text-body focus-ring bg-[var(--bg-primary)]"
              >
                {TIME_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-meta text-[var(--text-secondary)] pt-5">
              to
            </span>
            <div className="flex-1">
              <label
                htmlFor={period.endKey}
                className="text-meta text-[var(--text-secondary)] block mb-1"
              >
                End
              </label>
              <select
                id={period.endKey}
                value={values[period.endKey]}
                onChange={(e) =>
                  handleChange(period.endKey, e.target.value)
                }
                className="w-full rounded-md border border-[var(--border-default)] px-3 py-2 text-body focus-ring bg-[var(--bg-primary)]"
              >
                {TIME_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      ))}

      {error && (
        <p className="text-meta text-[var(--color-urgent)] bg-red-50 rounded-md p-[var(--space-3)]">
          {error}
        </p>
      )}

      <Button
        type="submit"
        disabled={isPending}
        className="w-full touch-target text-body bg-[var(--color-info)] text-white hover:bg-[var(--color-info)]/90"
      >
        {isPending ? "Saving..." : "Save Time Boundaries"}
      </Button>
    </form>
  );
}
