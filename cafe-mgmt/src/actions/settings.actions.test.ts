import { describe, it, expect } from "vitest";

// Extract validation logic for testing (mirrors server-side validation)
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

function validateTimeFormat(time: string): boolean {
  return timePattern.test(time);
}

function validateTimeBoundaries(values: {
  openingStart: string;
  openingEnd: string;
  midDayStart: string;
  midDayEnd: string;
  closingStart: string;
  closingEnd: string;
}): { valid: boolean; error?: string } {
  // Validate logical order
  if (values.openingStart >= values.openingEnd) {
    return { valid: false, error: "Opening: end time must be after start time" };
  }
  if (values.midDayStart >= values.midDayEnd) {
    return { valid: false, error: "Mid-Day: end time must be after start time" };
  }
  if (values.closingStart >= values.closingEnd) {
    return { valid: false, error: "Closing: end time must be after start time" };
  }
  // Validate contiguous
  if (values.openingEnd !== values.midDayStart) {
    return { valid: false, error: "Opening end time must match Mid-Day start time" };
  }
  if (values.midDayEnd !== values.closingStart) {
    return { valid: false, error: "Mid-Day end time must match Closing start time" };
  }
  return { valid: true };
}

describe("time format validation", () => {
  it("accepts valid HH:mm times", () => {
    expect(validateTimeFormat("00:00")).toBe(true);
    expect(validateTimeFormat("05:30")).toBe(true);
    expect(validateTimeFormat("12:00")).toBe(true);
    expect(validateTimeFormat("23:59")).toBe(true);
  });

  it("rejects invalid times", () => {
    expect(validateTimeFormat("24:00")).toBe(false);
    expect(validateTimeFormat("25:00")).toBe(false);
    expect(validateTimeFormat("12:60")).toBe(false);
    expect(validateTimeFormat("1:00")).toBe(false);
    expect(validateTimeFormat("abc")).toBe(false);
    expect(validateTimeFormat("")).toBe(false);
  });
});

describe("time boundary validation", () => {
  const validBoundaries = {
    openingStart: "05:00",
    openingEnd: "09:00",
    midDayStart: "09:00",
    midDayEnd: "15:00",
    closingStart: "15:00",
    closingEnd: "21:00",
  };

  it("accepts valid contiguous boundaries", () => {
    expect(validateTimeBoundaries(validBoundaries)).toEqual({ valid: true });
  });

  it("rejects opening start >= opening end", () => {
    const result = validateTimeBoundaries({
      ...validBoundaries,
      openingStart: "10:00",
      openingEnd: "09:00",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Opening");
  });

  it("rejects equal start and end for opening", () => {
    const result = validateTimeBoundaries({
      ...validBoundaries,
      openingStart: "09:00",
      openingEnd: "09:00",
    });
    expect(result.valid).toBe(false);
  });

  it("rejects midDay start >= midDay end", () => {
    const result = validateTimeBoundaries({
      ...validBoundaries,
      midDayStart: "16:00",
      midDayEnd: "15:00",
      openingEnd: "16:00",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Mid-Day");
  });

  it("rejects closing start >= closing end", () => {
    const result = validateTimeBoundaries({
      ...validBoundaries,
      closingStart: "22:00",
      closingEnd: "21:00",
      midDayEnd: "22:00",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Closing");
  });

  it("rejects non-contiguous opening end != midDay start", () => {
    const result = validateTimeBoundaries({
      ...validBoundaries,
      openingEnd: "10:00",
      midDayStart: "09:00",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Opening end time must match Mid-Day start time");
  });

  it("rejects non-contiguous midDay end != closing start", () => {
    const result = validateTimeBoundaries({
      ...validBoundaries,
      midDayEnd: "16:00",
      closingStart: "15:00",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Mid-Day end time must match Closing start time");
  });

  it("accepts custom contiguous boundaries", () => {
    const result = validateTimeBoundaries({
      openingStart: "06:00",
      openingEnd: "11:00",
      midDayStart: "11:00",
      midDayEnd: "17:00",
      closingStart: "17:00",
      closingEnd: "23:00",
    });
    expect(result).toEqual({ valid: true });
  });
});
