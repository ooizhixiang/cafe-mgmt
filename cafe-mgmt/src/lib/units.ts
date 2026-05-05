/**
 * Cafe-managed unit vocabulary. The picker UI lets a manager toggle which
 * units appear in inventory / purchase / supplier forms; this module is the
 * source of truth for the built-in catalog and the validation helper.
 *
 * No conversion math — units stay as freeform strings on the data layer
 * (option C from the discussion). The picker just constrains *input*.
 */

export type UnitDimension = "mass" | "volume" | "count";

export const BUILT_IN_UNITS_BY_DIMENSION: Record<UnitDimension, string[]> = {
  mass: ["kg", "g", "oz", "lb"],
  volume: ["L", "mL", "fl_oz", "cup", "tsp", "tbsp"],
  count: ["each", "dozen"],
};

export const DEFAULT_ENABLED_UNITS: string[] = ["kg", "g", "L", "mL", "each"];

export const ALL_BUILT_IN_UNITS: string[] = Object.values(
  BUILT_IN_UNITS_BY_DIMENSION
).flat();

const MAX_UNIT_LENGTH = 20;
const MAX_UNITS_PER_CAFE = 50;
// Whitespace inside a unit string is ambiguous and likely a paste mistake.
// Reject anything containing whitespace or surrounding whitespace.
const WHITESPACE = /\s/;

export function validateCustomUnit(
  value: string
):
  | { ok: true; normalized: string }
  | { ok: false; error: string } {
  if (typeof value !== "string") {
    return { ok: false, error: "Unit must be a string" };
  }
  if (value.length === 0) {
    return { ok: false, error: "Unit cannot be empty" };
  }
  if (value !== value.trim()) {
    return { ok: false, error: "Unit cannot have leading/trailing whitespace" };
  }
  if (WHITESPACE.test(value)) {
    return { ok: false, error: "Unit cannot contain whitespace" };
  }
  if (value.length > MAX_UNIT_LENGTH) {
    return {
      ok: false,
      error: `Unit must be ${MAX_UNIT_LENGTH} characters or fewer`,
    };
  }
  return { ok: true, normalized: value };
}

/**
 * Validate the full enabled-units list a manager submits via settings.
 * De-dupes (case-sensitive — "kg" and "Kg" are kept distinct, manager's call).
 * Returns the cleaned list or a per-entry error.
 */
export function validateEnabledUnitsList(
  units: unknown
):
  | { ok: true; cleaned: string[] }
  | { ok: false; error: string } {
  if (!Array.isArray(units)) {
    return { ok: false, error: "enabledUnits must be an array" };
  }
  if (units.length > MAX_UNITS_PER_CAFE) {
    return { ok: false, error: `Too many units (max ${MAX_UNITS_PER_CAFE})` };
  }
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const u of units) {
    const result = validateCustomUnit(u as string);
    if (!result.ok) return result;
    if (seen.has(result.normalized)) continue; // de-dup silently
    seen.add(result.normalized);
    cleaned.push(result.normalized);
  }
  return { ok: true, cleaned };
}

/**
 * Helper for the picker: given the cafe's enabled list and the row's current
 * value, return the list to show in the dropdown. If the current value isn't
 * in the enabled list (legacy data, deprecated unit), prepend it labeled
 * "(custom)" so the form stays usable.
 */
export interface PickerOption {
  value: string;
  label: string;
  isLegacy: boolean;
}

export function buildPickerOptions(
  enabledUnits: string[],
  currentValue: string | null | undefined
): PickerOption[] {
  const options: PickerOption[] = enabledUnits.map((u) => ({
    value: u,
    label: u,
    isLegacy: false,
  }));
  if (
    currentValue &&
    currentValue.length > 0 &&
    !enabledUnits.includes(currentValue)
  ) {
    options.unshift({
      value: currentValue,
      label: `${currentValue} (custom)`,
      isLegacy: true,
    });
  }
  return options;
}
