"use client";

import { useState } from "react";

interface QuantitySliderProps {
  mode: "percentage" | "discrete";
  value: number;
  min: number;
  max: number;
  snapIncrement?: number;
  unit: string;
  onConfirm: (value: number) => void;
  disabled?: boolean;
}

export function QuantitySlider({
  mode,
  value: initialValue,
  min,
  max,
  snapIncrement,
  unit,
  onConfirm,
  disabled,
}: QuantitySliderProps) {
  const [value, setValue] = useState(initialValue);
  const [isDirty, setIsDirty] = useState(false);

  function handleChange(newVal: number) {
    let snapped = newVal;
    if (snapIncrement && snapIncrement > 0) {
      snapped = Math.round(newVal / snapIncrement) * snapIncrement;
    }
    snapped = Math.max(min, Math.min(max, snapped));
    setValue(snapped);
    setIsDirty(snapped !== initialValue);
  }

  function handleConfirm() {
    onConfirm(value);
    setIsDirty(false);
  }

  const step = snapIncrement ?? (mode === "percentage" ? 5 : 1);

  return (
    <div className="flex items-center gap-[var(--space-2)]">
      {/* Stepper minus */}
      <button
        type="button"
        onClick={() => handleChange(value - step)}
        disabled={disabled || value <= min}
        className="touch-target flex size-[44px] items-center justify-center rounded-lg border border-[var(--border-default)] text-value font-bold disabled:opacity-30"
        aria-label="Decrease"
      >
        −
      </button>

      {/* Slider */}
      <div className="flex-1">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => handleChange(Number(e.target.value))}
          disabled={disabled}
          className="w-full accent-[var(--color-info)] h-2"
        />
      </div>

      {/* Stepper plus */}
      <button
        type="button"
        onClick={() => handleChange(value + step)}
        disabled={disabled || value >= max}
        className="touch-target flex size-[44px] items-center justify-center rounded-lg border border-[var(--border-default)] text-value font-bold disabled:opacity-30"
        aria-label="Increase"
      >
        +
      </button>

      {/* Confirm */}
      {isDirty && (
        <button
          type="button"
          onClick={handleConfirm}
          disabled={disabled}
          className="shrink-0 rounded-lg bg-[var(--color-info)] px-3 py-2 text-meta font-medium text-white disabled:opacity-50"
        >
          Save
        </button>
      )}
    </div>
  );
}
