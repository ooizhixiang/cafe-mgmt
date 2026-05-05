"use client";

import { buildPickerOptions } from "@/lib/units";

interface Props {
  value: string;
  onChange: (next: string) => void;
  enabledUnits: string[];
  /** Required for accessibility — every picker is associated with a labeled field. */
  ariaLabel: string;
  /** Optional `id` so existing `<label htmlFor>` associations keep working. */
  id?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Shared unit picker (`<select>`) used everywhere units are entered. Options
 * come from the cafe-managed `enabledUnits` list. If `value` isn't in that
 * list (legacy data, or a unit recently disabled in settings), the picker
 * prepends it as a "(custom)" option so the form stays usable — non-destructive.
 */
export function UnitPicker({
  value,
  onChange,
  enabledUnits,
  ariaLabel,
  id,
  disabled = false,
  className,
}: Props) {
  const options = buildPickerOptions(enabledUnits, value);

  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={
        className ??
        "w-full min-h-[44px] rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1 text-meta disabled:opacity-50"
      }
    >
      {options.length === 0 && <option value="">(no units enabled)</option>}
      {/*
        Disabled placeholder when the form starts with no value but units ARE
        enabled. Without it, a controlled `<select value="">` with no empty
        `<option>` visually snaps to the first option while React state stays
        `""` — a silent state/DOM mismatch where the user thinks they picked
        the displayed unit but the form submits empty.
      */}
      {value === "" && options.length > 0 && (
        <option value="" disabled>
          Select unit…
        </option>
      )}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
