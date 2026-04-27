import { describe, it, expect } from "vitest";
import {
  DEFAULT_TIME_BOUNDARIES,
  getDefaultTimeBoundaries,
  getCafeNow,
  formatCents,
  formatTime,
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

describe("getCafeNow", () => {
  it("returns a valid Date object", () => {
    const result = getCafeNow("America/New_York");
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).not.toBeNaN();
  });

  it("returns different times for different timezones", () => {
    const ny = getCafeNow("America/New_York");
    const la = getCafeNow("America/Los_Angeles");
    // LA is 3 hours behind NY
    const diffHours = (ny.getTime() - la.getTime()) / (1000 * 60 * 60);
    expect(Math.abs(diffHours - 3)).toBeLessThan(0.1);
  });

  it("works with UTC timezone", () => {
    const utc = getCafeNow("UTC");
    expect(utc).toBeInstanceOf(Date);
    expect(utc.getTime()).not.toBeNaN();
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
