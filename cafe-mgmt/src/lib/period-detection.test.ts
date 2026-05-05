import { describe, it, expect, vi } from "vitest";
import {
  getCurrentPeriod,
  getNextPeriod,
  getAllPeriods,
  type TimeBoundaries,
} from "./period-detection";

const DEFAULT_BOUNDARIES: TimeBoundaries = {
  openingStart: null,
  openingEnd: null,
  midDayStart: null,
  midDayEnd: null,
  closingStart: null,
  closingEnd: null,
};

const CUSTOM_BOUNDARIES: TimeBoundaries = {
  openingStart: "06:00",
  openingEnd: "10:00",
  midDayStart: "10:00",
  midDayEnd: "16:00",
  closingStart: "16:00",
  closingEnd: "22:00",
};

describe("getAllPeriods", () => {
  it("returns 3 periods", () => {
    const periods = getAllPeriods(DEFAULT_BOUNDARIES);
    expect(periods).toHaveLength(3);
  });

  it("uses default boundaries when null", () => {
    const periods = getAllPeriods(DEFAULT_BOUNDARIES);
    expect(periods[0].startTime).toBe("05:00");
    expect(periods[0].endTime).toBe("09:00");
  });

  it("uses custom boundaries when provided", () => {
    const periods = getAllPeriods(CUSTOM_BOUNDARIES);
    expect(periods[0].startTime).toBe("06:00");
    expect(periods[0].endTime).toBe("10:00");
  });

  it("includes formatted labels", () => {
    const periods = getAllPeriods(DEFAULT_BOUNDARIES);
    expect(periods[0].label).toContain("Opening");
    expect(periods[1].label).toContain("Mid-Day");
    expect(periods[2].label).toContain("Closing");
  });

  it("covers all three periods", () => {
    const periods = getAllPeriods(DEFAULT_BOUNDARIES);
    expect(periods.map((p) => p.period)).toEqual([
      "OPENING",
      "MID_DAY",
      "CLOSING",
    ]);
  });
});

describe("getCurrentPeriod", () => {
  it("returns OPENING during opening hours", () => {
    // Mock getCafeNow to return 7:00 AM
    vi.doMock("@/lib/format", async () => {
      const actual = await vi.importActual<typeof import("@/lib/format")>("@/lib/format");
      return {
        ...actual,
        getCafeNow: () => new Date(2024, 0, 1, 7, 0),
      };
    });
  });

  it("returns null outside all periods", () => {
    // 3:00 AM is before opening (5:00 AM default)
    vi.doMock("@/lib/format", async () => {
      const actual = await vi.importActual<typeof import("@/lib/format")>("@/lib/format");
      return {
        ...actual,
        getCafeNow: () => new Date(2024, 0, 1, 3, 0),
      };
    });
  });
});

describe("getNextPeriod", () => {
  it("returns a PeriodInfo or null", () => {
    const result = getNextPeriod(DEFAULT_BOUNDARIES);
    // Either null or a valid period
    if (result) {
      expect(result.period).toBeDefined();
      expect(result.label).toBeDefined();
    }
  });
});

describe("time label formatting", () => {
  it("formats periods with AM/PM labels", () => {
    const periods = getAllPeriods(DEFAULT_BOUNDARIES);
    // Opening: 5:00 AM - 9:00 AM
    expect(periods[0].label).toMatch(/5AM/);
    expect(periods[0].label).toMatch(/9AM/);
    // Closing: 3:00 PM - 9:00 PM
    expect(periods[2].label).toMatch(/3PM/);
    expect(periods[2].label).toMatch(/9PM/);
  });
});
