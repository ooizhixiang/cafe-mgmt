import { describe, it, expect } from "vitest";
import {
  DEFAULT_TIME_BOUNDARIES,
  getDefaultTimeBoundaries,
  getCafeNow,
  CAFE_TIMEZONE,
  formatCents,
  formatTime,
  parseRMToCentsPrecise,
} from "./format";

describe("DEFAULT_TIME_BOUNDARIES", () => {
  it("has correct default values", () => {
    expect(DEFAULT_TIME_BOUNDARIES).toEqual({
      openingStart: "05:00",
      openingEnd: "09:00",
      midDayStart: "09:00",
      midDayEnd: "15:00",
      closingStart: "15:00",
      closingEnd: "21:00",
    });
  });

  it("periods are contiguous (opening end = midDay start, midDay end = closing start)", () => {
    expect(DEFAULT_TIME_BOUNDARIES.openingEnd).toBe(
      DEFAULT_TIME_BOUNDARIES.midDayStart
    );
    expect(DEFAULT_TIME_BOUNDARIES.midDayEnd).toBe(
      DEFAULT_TIME_BOUNDARIES.closingStart
    );
  });

  it("each period has start before end", () => {
    expect(DEFAULT_TIME_BOUNDARIES.openingStart < DEFAULT_TIME_BOUNDARIES.openingEnd).toBe(true);
    expect(DEFAULT_TIME_BOUNDARIES.midDayStart < DEFAULT_TIME_BOUNDARIES.midDayEnd).toBe(true);
    expect(DEFAULT_TIME_BOUNDARIES.closingStart < DEFAULT_TIME_BOUNDARIES.closingEnd).toBe(true);
  });
});

describe("getDefaultTimeBoundaries", () => {
  it("returns a copy, not the original object", () => {
    const copy = getDefaultTimeBoundaries();
    expect(copy).toEqual(DEFAULT_TIME_BOUNDARIES);
    expect(copy).not.toBe(DEFAULT_TIME_BOUNDARIES);
  });
});

describe("CAFE_TIMEZONE", () => {
  it("is locked to Asia/Kuala_Lumpur", () => {
    expect(CAFE_TIMEZONE).toBe("Asia/Kuala_Lumpur");
  });
});

describe("getCafeNow", () => {
  it("returns a valid Date object", () => {
    const result = getCafeNow();
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).not.toBeNaN();
  });

  it("returns wall-clock time in Asia/Kuala_Lumpur (UTC+8)", () => {
    const cafe = getCafeNow();
    // Independently compute the KL wall clock from the same `now`. We compare
    // the two within a 2s tolerance to absorb the jitter between the two
    // `Date.now()` reads (cafe vs. expected) without coupling to the test
    // runner's wall clock.
    const now = new Date();
    const klFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kuala_Lumpur",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = klFormatter.formatToParts(now);
    const get = (type: string) =>
      parts.find((p) => p.type === type)?.value ?? "0";
    const expected = new Date(
      `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`
    );
    expect(Math.abs(cafe.getTime() - expected.getTime())).toBeLessThan(2000);
  });
});

describe("formatCents", () => {
  it("formats whole dollar amounts", () => {
    expect(formatCents(500)).toBe("$5.00");
  });

  it("formats amounts with cents", () => {
    expect(formatCents(1299)).toBe("$12.99");
  });

  it("formats zero", () => {
    expect(formatCents(0)).toBe("$0.00");
  });

  it("floors sub-cent values to $0.00", () => {
    expect(formatCents(0.5)).toBe("$0.00");
    expect(formatCents(0.99)).toBe("$0.00");
  });

  it("floors fractional cents within an integer dollar", () => {
    // 350.7 cents → floor to 350 → $3.50
    expect(formatCents(350.7)).toBe("$3.50");
  });

  it("handles null and undefined as $0.00", () => {
    expect(formatCents(null)).toBe("$0.00");
    expect(formatCents(undefined)).toBe("$0.00");
  });

  it("accepts a string (Prisma Decimal stringified)", () => {
    expect(formatCents("350.0000")).toBe("$3.50");
    expect(formatCents("0.5000")).toBe("$0.00");
  });

  it("truncates negative fractional cents toward zero (not toward -infinity)", () => {
    // -50.5 cents → trunc to -50 → $-0.50 (NOT $-0.51 as Math.floor would give)
    expect(formatCents(-50.5)).toBe("$-0.50");
    // -0.5 cents → trunc to 0 → $0.00
    expect(formatCents(-0.5)).toBe("$0.00");
    // Whole negatives unchanged
    expect(formatCents(-500)).toBe("$-5.00");
    expect(formatCents(-1299)).toBe("$-12.99");
  });
});

describe("parseRMToCentsPrecise", () => {
  it("parses '12.30' to exactly 1230 (no float noise)", () => {
    expect(parseRMToCentsPrecise("12.30")).toBe(1230);
  });

  it("parses sub-cent precision '0.005' to 0.5", () => {
    expect(parseRMToCentsPrecise("0.005")).toBe(0.5);
  });

  it("parses '12.305' to 1230.5", () => {
    expect(parseRMToCentsPrecise("12.305")).toBe(1230.5);
  });

  it("parses whole number '12' to 1200", () => {
    expect(parseRMToCentsPrecise("12")).toBe(1200);
  });

  it("parses leading-dot '.50' to 50", () => {
    expect(parseRMToCentsPrecise(".50")).toBe(50);
  });

  it("returns null for empty string", () => {
    expect(parseRMToCentsPrecise("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(parseRMToCentsPrecise("   ")).toBeNull();
  });

  it("returns null for non-numeric input", () => {
    expect(parseRMToCentsPrecise("abc")).toBeNull();
  });

  it("returns null for negative numbers", () => {
    expect(parseRMToCentsPrecise("-5")).toBeNull();
    expect(parseRMToCentsPrecise("-0.50")).toBeNull();
  });

  it("returns null for bare '.'", () => {
    expect(parseRMToCentsPrecise(".")).toBeNull();
  });

  it("returns null for bare '-'", () => {
    expect(parseRMToCentsPrecise("-")).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(parseRMToCentsPrecise("  12.30  ")).toBe(1230);
  });

  it("truncates fractional digits beyond 4 decimal places of cent precision", () => {
    // "0.0001234567" — only first 6 fractional digits considered
    // dollars=0, fracPadded="000123", fracInt=123 → 123 / 10000 = 0.0123
    expect(parseRMToCentsPrecise("0.0001234567")).toBe(0.0123);
  });
});

describe("formatTime", () => {
  it("formats a morning time", () => {
    const date = new Date("2024-01-01T09:30:00");
    const result = formatTime(date);
    expect(result).toMatch(/9:30\s*AM/);
  });

  it("formats an afternoon time", () => {
    const date = new Date("2024-01-01T14:00:00");
    const result = formatTime(date);
    expect(result).toMatch(/2:00\s*PM/);
  });
});
