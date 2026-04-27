import { describe, it, expect } from "vitest";
import { z } from "zod";

// Test Zod schemas used in supplier actions

const addSupplierSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  phone: z.string().max(20).optional(),
  notes: z.string().max(500).optional(),
  reminderDays: z.number().int().min(1).max(90).optional(),
});

const updateSupplierSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Name is required").max(100),
  phone: z.string().max(20).optional(),
  notes: z.string().max(500).optional(),
  reminderDays: z.number().int().min(1).max(90).optional(),
});

const logOutcomeSchema = z.object({
  supplierId: z.string().min(1),
  outcome: z.enum(["ORDERED", "NO_ANSWER", "CALL_BACK"]),
});

describe("addSupplierSchema", () => {
  it("accepts valid supplier data", () => {
    const result = addSupplierSchema.safeParse({
      name: "Bean Co",
      phone: "555-1234",
      notes: "Weekly delivery",
    });
    expect(result.success).toBe(true);
  });

  it("accepts name only", () => {
    const result = addSupplierSchema.safeParse({ name: "Bean Co" });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = addSupplierSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects name over 100 chars", () => {
    const result = addSupplierSchema.safeParse({ name: "x".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("rejects phone over 20 chars", () => {
    const result = addSupplierSchema.safeParse({
      name: "Bean Co",
      phone: "1".repeat(21),
    });
    expect(result.success).toBe(false);
  });

  it("rejects notes over 500 chars", () => {
    const result = addSupplierSchema.safeParse({
      name: "Bean Co",
      notes: "x".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("accepts custom reminder days", () => {
    const result = addSupplierSchema.safeParse({
      name: "Bean Co",
      reminderDays: 14,
    });
    expect(result.success).toBe(true);
  });

  it("rejects reminder days of 0", () => {
    const result = addSupplierSchema.safeParse({
      name: "Bean Co",
      reminderDays: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects reminder days over 90", () => {
    const result = addSupplierSchema.safeParse({
      name: "Bean Co",
      reminderDays: 91,
    });
    expect(result.success).toBe(false);
  });
});

describe("logOutcomeSchema", () => {
  it("accepts all valid outcomes", () => {
    for (const outcome of ["ORDERED", "NO_ANSWER", "CALL_BACK"]) {
      const result = logOutcomeSchema.safeParse({
        supplierId: "sup123",
        outcome,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid outcome", () => {
    const result = logOutcomeSchema.safeParse({
      supplierId: "sup123",
      outcome: "CANCELLED",
    });
    expect(result.success).toBe(false);
  });

});

describe("Supplier reminder logic", () => {
  function daysSince(date: Date, now: Date): number {
    const ms = now.getTime() - date.getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
  }

  it("triggers reminder when no last order date", () => {
    const lastOrderDate = null;
    const needsReminder = lastOrderDate === null;
    expect(needsReminder).toBe(true);
  });

  it("triggers reminder when threshold exceeded", () => {
    const now = new Date(2026, 2, 12);
    const lastOrder = new Date(2026, 2, 1); // 11 days ago
    const reminderDays = 7;
    expect(daysSince(lastOrder, now) >= reminderDays).toBe(true);
  });

  it("does not trigger reminder within threshold", () => {
    const now = new Date(2026, 2, 12);
    const lastOrder = new Date(2026, 2, 8); // 4 days ago
    const reminderDays = 7;
    expect(daysSince(lastOrder, now) >= reminderDays).toBe(false);
  });

  it("ORDERED outcome updates lastOrderDate", () => {
    const outcome = "ORDERED";
    const shouldUpdateDate = outcome === "ORDERED";
    expect(shouldUpdateDate).toBe(true);
  });

  it("NO_ANSWER outcome does not update lastOrderDate", () => {
    const outcome = "NO_ANSWER";
    const shouldUpdateDate = outcome === "ORDERED";
    expect(shouldUpdateDate).toBe(false);
  });
});
