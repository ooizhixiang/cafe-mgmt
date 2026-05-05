import { describe, it, expect } from "vitest";
import {
  convert,
  dimensionOf,
  formatConvertedQuantity,
  compatibleUnits,
} from "./unit-conversion";

describe("dimensionOf", () => {
  it("classifies mass units", () => {
    expect(dimensionOf("kg")).toBe("mass");
    expect(dimensionOf("g")).toBe("mass");
    expect(dimensionOf("lb")).toBe("mass");
    expect(dimensionOf("oz")).toBe("mass");
  });

  it("classifies volume units", () => {
    expect(dimensionOf("L")).toBe("volume");
    expect(dimensionOf("mL")).toBe("volume");
    expect(dimensionOf("fl_oz")).toBe("volume");
    expect(dimensionOf("cup")).toBe("volume");
    expect(dimensionOf("tbsp")).toBe("volume");
    expect(dimensionOf("tsp")).toBe("volume");
  });

  it("classifies count units", () => {
    expect(dimensionOf("each")).toBe("count");
    expect(dimensionOf("dozen")).toBe("count");
  });

  it("returns null for unknown / custom units", () => {
    expect(dimensionOf("scoop")).toBeNull();
    expect(dimensionOf("")).toBeNull();
    expect(dimensionOf("KG")).toBeNull(); // case-sensitive
  });
});

describe("convert", () => {
  it("returns the input quantity when from === to", () => {
    expect(convert(2, "L", "L")).toBe(2);
    expect(convert(0, "kg", "kg")).toBe(0);
  });

  it("converts L to mL (the user's reported case)", () => {
    expect(convert(1, "L", "mL")).toBe(1000);
    expect(convert(2.5, "L", "mL")).toBe(2500);
  });

  it("converts mL to L (small to big)", () => {
    expect(convert(500, "mL", "L")).toBe(0.5);
    expect(convert(1500, "mL", "L")).toBe(1.5);
  });

  it("converts kg to g and back", () => {
    expect(convert(1, "kg", "g")).toBe(1000);
    expect(convert(2500, "g", "kg")).toBe(2.5);
  });

  it("converts oz to g (sub-cent factor)", () => {
    expect(convert(1, "oz", "g")).toBeCloseTo(28.3495);
  });

  it("converts dozen to each and back", () => {
    expect(convert(2, "dozen", "each")).toBe(24);
    expect(convert(24, "each", "dozen")).toBe(2);
  });

  it("returns null for cross-dimension conversion", () => {
    expect(convert(1, "L", "g")).toBeNull();
    expect(convert(1, "kg", "mL")).toBeNull();
    expect(convert(1, "each", "L")).toBeNull();
  });

  it("returns null for unknown units", () => {
    expect(convert(1, "scoop", "mL")).toBeNull();
    expect(convert(1, "L", "scoop")).toBeNull();
    expect(convert(1, "scoop", "scoop2")).toBeNull();
  });

  it("preserves zero through conversion", () => {
    expect(convert(0, "L", "mL")).toBe(0);
  });
});

describe("formatConvertedQuantity", () => {
  it("renders whole numbers without a decimal", () => {
    expect(formatConvertedQuantity(2000)).toBe("2000");
    expect(formatConvertedQuantity(0)).toBe("0");
  });

  it("rounds fractional values to 2 decimals", () => {
    expect(formatConvertedQuantity(0.5)).toBe("0.50");
    expect(formatConvertedQuantity(33.81)).toBe("33.81");
    expect(formatConvertedQuantity(28.3495)).toBe("28.35");
  });

  it("absorbs float drift near integers (1e-9 tolerance)", () => {
    expect(formatConvertedQuantity(1000.0000000001)).toBe("1000");
  });

  it("passes through non-finite values rather than crashing", () => {
    expect(formatConvertedQuantity(NaN)).toBe("NaN");
    expect(formatConvertedQuantity(Infinity)).toBe("Infinity");
  });
});

describe("compatibleUnits", () => {
  it("returns all mass units for a mass input", () => {
    const units = compatibleUnits("kg");
    expect(units).toEqual(expect.arrayContaining(["g", "kg", "lb", "oz"]));
    expect(units).not.toContain("mL");
    expect(units).not.toContain("each");
  });

  it("returns all volume units for a volume input", () => {
    const units = compatibleUnits("L");
    expect(units).toEqual(
      expect.arrayContaining(["mL", "L", "fl_oz", "cup", "tbsp", "tsp"])
    );
    expect(units).not.toContain("kg");
  });

  it("returns empty array for unknown / custom units", () => {
    expect(compatibleUnits("scoop")).toEqual([]);
  });
});
