import { describe, it, expect } from "vitest";
import { computeMargin, isBelowFloor, effectiveSellingPrice } from "./margin";

describe("computeMargin", () => {
  it("positive margin: 80% on $5 selling / $1 cost", () => {
    expect(computeMargin(500, 100)).toBeCloseTo(0.8);
  });

  it("zero margin: cost equals selling", () => {
    expect(computeMargin(500, 500)).toBe(0);
  });

  it("negative margin: outright loss when cost > selling", () => {
    expect(computeMargin(100, 200)).toBeCloseTo(-1.0);
  });

  it("null when selling is 0 (un-priced)", () => {
    expect(computeMargin(0, 100)).toBeNull();
  });

  it("null when selling is negative (corrupt input)", () => {
    expect(computeMargin(-50, 100)).toBeNull();
  });

  it("null when inputs are non-finite (NaN, Infinity)", () => {
    expect(computeMargin(NaN, 100)).toBeNull();
    expect(computeMargin(Infinity, 100)).toBeNull();
    expect(computeMargin(500, NaN)).toBeNull();
  });

  it("100% margin when cost is 0 (free ingredients)", () => {
    expect(computeMargin(500, 0)).toBe(1);
  });
});

describe("isBelowFloor", () => {
  it("true when margin is below the floor", () => {
    expect(isBelowFloor(0.1, 20)).toBe(true); // 10% < 20%
  });

  it("false when margin equals the floor (strict <)", () => {
    expect(isBelowFloor(0.2, 20)).toBe(false);
  });

  it("false when margin is above the floor", () => {
    expect(isBelowFloor(0.5, 20)).toBe(false);
  });

  it("true for outright loss against any non-negative floor", () => {
    expect(isBelowFloor(-0.5, 0)).toBe(true);
    expect(isBelowFloor(-0.5, 20)).toBe(true);
  });

  it("false for null margin (un-priced — never below floor)", () => {
    expect(isBelowFloor(null, 20)).toBe(false);
  });

  it("floor 0 fires only on outright loss (negative margin)", () => {
    expect(isBelowFloor(0, 0)).toBe(false);
    expect(isBelowFloor(-0.01, 0)).toBe(true);
  });

  it("floor 99 fires on almost everything except margin >= 0.99", () => {
    expect(isBelowFloor(0.98, 99)).toBe(true);
    expect(isBelowFloor(0.99, 99)).toBe(false);
  });
});

describe("effectiveSellingPrice", () => {
  it("returns variation price when set", () => {
    expect(effectiveSellingPrice(500, 700)).toBe(500);
  });

  it("falls back to recipe price when variation is null", () => {
    expect(effectiveSellingPrice(null, 700)).toBe(700);
  });

  it("falls back to recipe price when variation is undefined", () => {
    expect(effectiveSellingPrice(undefined, 700)).toBe(700);
  });

  it("falls back to recipe price when variation is 0 (treats 0 as not-set)", () => {
    expect(effectiveSellingPrice(0, 700)).toBe(700);
  });

  it("returns null when both are null/zero (pre-launch state)", () => {
    expect(effectiveSellingPrice(null, null)).toBeNull();
    expect(effectiveSellingPrice(0, 0)).toBeNull();
    expect(effectiveSellingPrice(undefined, undefined)).toBeNull();
  });
});
