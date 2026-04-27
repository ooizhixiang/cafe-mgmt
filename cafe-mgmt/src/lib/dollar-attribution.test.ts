import { describe, it, expect } from "vitest";
import { calculateDollarValue } from "./dollar-attribution";

describe("calculateDollarValue", () => {
  it("returns 0 when no cost set", () => {
    const result = calculateDollarValue(
      { costPerUnitInCents: null, unitsPerContainer: null, unit: "bags" },
      5
    );
    expect(result).toBe(0);
  });

  it("returns 0 when delta is 0", () => {
    const result = calculateDollarValue(
      { costPerUnitInCents: 500, unitsPerContainer: null, unit: "bags" },
      0
    );
    expect(result).toBe(0);
  });

  it("calculates discrete dollar value", () => {
    const result = calculateDollarValue(
      { costPerUnitInCents: 250, unitsPerContainer: null, unit: "bags" },
      3
    );
    expect(result).toBe(750); // 3 * 250 cents
  });

  it("uses absolute value of delta", () => {
    const result = calculateDollarValue(
      { costPerUnitInCents: 100, unitsPerContainer: null, unit: "bags" },
      -5
    );
    expect(result).toBe(500);
  });

  it("calculates percentage-based value with unitsPerContainer", () => {
    // 20% of a container with 12 units at $1.00/unit
    const result = calculateDollarValue(
      { costPerUnitInCents: 100, unitsPerContainer: 12, unit: "%" },
      20
    );
    // (20/100) * 12 * 100 = 240
    expect(result).toBe(240);
  });

  it("falls back to discrete for % without unitsPerContainer", () => {
    const result = calculateDollarValue(
      { costPerUnitInCents: 100, unitsPerContainer: null, unit: "%" },
      10
    );
    // Without unitsPerContainer, treats as discrete: 10 * 100
    expect(result).toBe(1000);
  });

  it("rounds to nearest cent for percentage calculations", () => {
    const result = calculateDollarValue(
      { costPerUnitInCents: 333, unitsPerContainer: 7, unit: "%" },
      15
    );
    // (15/100) * 7 * 333 = 349.65 → rounds to 350
    expect(result).toBe(350);
  });
});
