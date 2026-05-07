import { describe, it, expect } from "vitest";
import {
  BUILT_IN_UNITS_BY_DIMENSION,
  DEFAULT_ENABLED_UNITS,
  ALL_BUILT_IN_UNITS,
  validateCustomUnit,
  validateEnabledUnitsList,
  buildPickerOptions,
} from "./units";

describe("BUILT_IN_UNITS_BY_DIMENSION", () => {
  it("groups units by dimension", () => {
    expect(BUILT_IN_UNITS_BY_DIMENSION.mass).toContain("kg");
    expect(BUILT_IN_UNITS_BY_DIMENSION.volume).toContain("mL");
    expect(BUILT_IN_UNITS_BY_DIMENSION.count).toContain("each");
  });

  it("has no duplicates across dimensions", () => {
    expect(new Set(ALL_BUILT_IN_UNITS).size).toBe(ALL_BUILT_IN_UNITS.length);
  });
});

describe("DEFAULT_ENABLED_UNITS", () => {
  it("contains the 5 universal cafe units", () => {
    expect(DEFAULT_ENABLED_UNITS).toEqual(["kg", "g", "L", "mL", "each"]);
  });

  it("every default is in the built-in catalog", () => {
    for (const u of DEFAULT_ENABLED_UNITS) {
      expect(ALL_BUILT_IN_UNITS).toContain(u);
    }
  });
});

describe("validateCustomUnit", () => {
  it("accepts a normal short unit string", () => {
    expect(validateCustomUnit("scoop")).toEqual({ ok: true, normalized: "scoop" });
  });

  it("rejects empty string", () => {
    const r = validateCustomUnit("");
    expect(r.ok).toBe(false);
  });

  it("rejects leading/trailing whitespace", () => {
    expect(validateCustomUnit(" kg").ok).toBe(false);
    expect(validateCustomUnit("kg ").ok).toBe(false);
  });

  it("rejects internal whitespace", () => {
    expect(validateCustomUnit("fl oz").ok).toBe(false);
  });

  it("rejects strings over 20 characters", () => {
    const r = validateCustomUnit("a".repeat(21));
    expect(r.ok).toBe(false);
  });

  it("accepts strings exactly at the 20-char boundary", () => {
    const r = validateCustomUnit("a".repeat(20));
    expect(r.ok).toBe(true);
  });

  it("rejects non-string types", () => {
    expect(validateCustomUnit(null as unknown as string).ok).toBe(false);
    expect(validateCustomUnit(undefined as unknown as string).ok).toBe(false);
    expect(validateCustomUnit(123 as unknown as string).ok).toBe(false);
  });
});

describe("validateEnabledUnitsList", () => {
  it("accepts a normal list", () => {
    const r = validateEnabledUnitsList(["kg", "g", "L"]);
    expect(r).toEqual({ ok: true, cleaned: ["kg", "g", "L"] });
  });

  it("accepts an empty list (manager wants no enabled units)", () => {
    const r = validateEnabledUnitsList([]);
    expect(r).toEqual({ ok: true, cleaned: [] });
  });

  it("de-dupes silently", () => {
    const r = validateEnabledUnitsList(["kg", "g", "kg", "L", "g"]);
    expect(r).toEqual({ ok: true, cleaned: ["kg", "g", "L"] });
  });

  it("preserves order on first appearance", () => {
    const r = validateEnabledUnitsList(["L", "kg", "g"]);
    expect(r).toEqual({ ok: true, cleaned: ["L", "kg", "g"] });
  });

  it("treats 'kg' and 'Kg' as distinct (case-sensitive)", () => {
    const r = validateEnabledUnitsList(["kg", "Kg"]);
    expect(r).toEqual({ ok: true, cleaned: ["kg", "Kg"] });
  });

  it("rejects non-array input", () => {
    expect(validateEnabledUnitsList("kg" as unknown as string[]).ok).toBe(false);
    expect(validateEnabledUnitsList(null as unknown as string[]).ok).toBe(false);
  });

  it("rejects when any entry fails individual validation", () => {
    expect(validateEnabledUnitsList(["kg", "fl oz"]).ok).toBe(false);
    expect(validateEnabledUnitsList(["kg", ""]).ok).toBe(false);
  });

  it("rejects more than 50 entries", () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => `u${i}`);
    expect(validateEnabledUnitsList(tooMany).ok).toBe(false);
  });
});

describe("buildPickerOptions", () => {
  it("returns enabled units when current value is in the enabled list", () => {
    const opts = buildPickerOptions(["kg", "g", "L"], "g");
    expect(opts).toEqual([
      { value: "kg", label: "kg", isLegacy: false },
      { value: "g", label: "g", isLegacy: false },
      { value: "L", label: "L", isLegacy: false },
    ]);
  });

  it("prepends the current value as a plain legacy option when not in the enabled list", () => {
    const opts = buildPickerOptions(["kg", "g", "L"], "kgs");
    expect(opts[0]).toEqual({ value: "kgs", label: "kgs", isLegacy: true });
    // Followed by the regular enabled options
    expect(opts.slice(1).map((o) => o.value)).toEqual(["kg", "g", "L"]);
  });

  it("returns just enabled units when current value is null/undefined/empty", () => {
    expect(buildPickerOptions(["kg", "g"], null).length).toBe(2);
    expect(buildPickerOptions(["kg", "g"], undefined).length).toBe(2);
    expect(buildPickerOptions(["kg", "g"], "").length).toBe(2);
  });

  it("returns just the legacy entry when no units are enabled and there's a current value", () => {
    const opts = buildPickerOptions([], "kgs");
    expect(opts).toEqual([{ value: "kgs", label: "kgs", isLegacy: true }]);
  });

  it("returns empty array when nothing is enabled and no current value", () => {
    expect(buildPickerOptions([], null)).toEqual([]);
  });
});
