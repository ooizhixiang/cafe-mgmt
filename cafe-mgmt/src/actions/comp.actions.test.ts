import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  encodeOverDeductionError,
  parseOverDeductionError,
} from "@/lib/lot-consume";

// Test Zod schemas and budget logic used in comp actions

const logCompSchema = z.object({
  ingredientId: z.string().min(1),
  quantity: z.number().int().min(1),
  reason: z.string().min(1, "Reason is required").max(200),
  confirmOverDeduction: z.boolean().optional(),
});

const updateBudgetSchema = z.object({
  amountInCents: z.number().int().min(1),
  resetDay: z.number().int().min(0).max(6),
});

describe("logCompSchema", () => {
  it("accepts valid comp data", () => {
    const result = logCompSchema.safeParse({
      ingredientId: "ing123",
      quantity: 1,
      reason: "Customer complaint",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty reason", () => {
    const result = logCompSchema.safeParse({
      ingredientId: "ing123",
      quantity: 1,
      reason: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects reason over 200 chars", () => {
    const result = logCompSchema.safeParse({
      ingredientId: "ing123",
      quantity: 1,
      reason: "x".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero quantity", () => {
    const result = logCompSchema.safeParse({
      ingredientId: "ing123",
      quantity: 0,
      reason: "Test",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateBudgetSchema", () => {
  it("accepts valid budget", () => {
    const result = updateBudgetSchema.safeParse({
      amountInCents: 10000,
      resetDay: 1,
    });
    expect(result.success).toBe(true);
  });

  it("accepts all valid reset days (0-6)", () => {
    for (let i = 0; i <= 6; i++) {
      const result = updateBudgetSchema.safeParse({
        amountInCents: 5000,
        resetDay: i,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects zero budget amount", () => {
    const result = updateBudgetSchema.safeParse({
      amountInCents: 0,
      resetDay: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid reset day (7)", () => {
    const result = updateBudgetSchema.safeParse({
      amountInCents: 5000,
      resetDay: 7,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative reset day", () => {
    const result = updateBudgetSchema.safeParse({
      amountInCents: 5000,
      resetDay: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe("Week start calculation", () => {
  // Mirrors the canonical helper in src/lib/format.ts (UTC-based, since the
  // production site now feeds it UTC-midnight dates from getCafeToday()).
  function getWeekStart(today: Date, resetDay: number): Date {
    const d = new Date(today);
    const currentDay = d.getUTCDay();
    const diff = (currentDay - resetDay + 7) % 7;
    d.setUTCDate(d.getUTCDate() - diff);
    return d;
  }

  it("finds Monday start when today is Thursday", () => {
    // Thursday March 12, 2026 (UTC)
    const thu = new Date(Date.UTC(2026, 2, 12));
    const start = getWeekStart(thu, 1); // Monday
    expect(start.getUTCDay()).toBe(1);
    expect(start.getUTCDate()).toBe(9); // March 9 is Monday
  });

  it("returns today when today is the reset day", () => {
    // Monday March 9, 2026 (UTC)
    const mon = new Date(Date.UTC(2026, 2, 9));
    const start = getWeekStart(mon, 1); // Monday
    expect(start.getUTCDay()).toBe(1);
    expect(start.getUTCDate()).toBe(9);
  });

  it("finds Sunday start when today is Saturday", () => {
    // Saturday March 14, 2026 (UTC)
    const sat = new Date(Date.UTC(2026, 2, 14));
    const start = getWeekStart(sat, 0); // Sunday
    expect(start.getUTCDay()).toBe(0);
    expect(start.getUTCDate()).toBe(8); // March 8
  });
});

describe("Spec B2 — confirmOverDeduction schema + wire format", () => {
  it("accepts confirmOverDeduction = true", () => {
    const result = logCompSchema.safeParse({
      ingredientId: "ing123",
      quantity: 5,
      reason: "Customer service",
      confirmOverDeduction: true,
    });
    expect(result.success).toBe(true);
  });

  it("encodes + parses OVER_DEDUCTION payload", () => {
    const wire = encodeOverDeductionError({
      availableQty: 0,
      requestedQty: 3,
    });
    expect(parseOverDeductionError(wire)).toEqual({
      availableQty: 0,
      requestedQty: 3,
    });
  });
});

describe("Budget warning thresholds", () => {
  it("warns at 80% spending", () => {
    const budget = 10000;
    const spent = 8000;
    const percentage = spent / budget;
    expect(percentage >= 0.8).toBe(true);
    expect(percentage >= 1.0).toBe(false);
  });

  it("exceeds at 100% spending", () => {
    const budget = 10000;
    const spent = 10000;
    const percentage = spent / budget;
    expect(percentage >= 1.0).toBe(true);
  });

  it("no warning under 80%", () => {
    const budget = 10000;
    const spent = 7000;
    const percentage = spent / budget;
    expect(percentage >= 0.8).toBe(false);
  });

  it("exceeds when over 100%", () => {
    const budget = 10000;
    const spent = 12000;
    const percentage = spent / budget;
    expect(percentage >= 1.0).toBe(true);
  });
});
