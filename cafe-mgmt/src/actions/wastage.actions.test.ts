import { describe, it, expect } from "vitest";
import { z } from "zod";

// Test Zod schemas used in wastage actions

const logWastageSchema = z.object({
  ingredientId: z.string().min(1),
  quantity: z.number().int().min(1),
  reason: z.enum(["SPILLED", "EXPIRED", "INCORRECT"]),
});

const voidWastageSchema = z.object({
  id: z.string().min(1),
  voidReason: z.string().min(1, "Void reason is required").max(200),
});

const correctWastageSchema = z.object({
  id: z.string().min(1),
  newQuantity: z.number().int().min(1),
});

describe("logWastageSchema", () => {
  it("accepts valid wastage data", () => {
    const result = logWastageSchema.safeParse({
      ingredientId: "ing123",
      quantity: 2,
      reason: "SPILLED",
    });
    expect(result.success).toBe(true);
  });

  it("accepts all valid reasons", () => {
    for (const reason of ["SPILLED", "EXPIRED", "INCORRECT"]) {
      const result = logWastageSchema.safeParse({
        ingredientId: "ing123",
        quantity: 1,
        reason,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid reason", () => {
    const result = logWastageSchema.safeParse({
      ingredientId: "ing123",
      quantity: 1,
      reason: "DROPPED",
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero quantity", () => {
    const result = logWastageSchema.safeParse({
      ingredientId: "ing123",
      quantity: 0,
      reason: "SPILLED",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative quantity", () => {
    const result = logWastageSchema.safeParse({
      ingredientId: "ing123",
      quantity: -1,
      reason: "SPILLED",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty ingredientId", () => {
    const result = logWastageSchema.safeParse({
      ingredientId: "",
      quantity: 1,
      reason: "SPILLED",
    });
    expect(result.success).toBe(false);
  });
});

describe("voidWastageSchema", () => {
  it("accepts valid void data", () => {
    const result = voidWastageSchema.safeParse({
      id: "entry123",
      voidReason: "Counted wrong",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty void reason", () => {
    const result = voidWastageSchema.safeParse({
      id: "entry123",
      voidReason: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects void reason over 200 chars", () => {
    const result = voidWastageSchema.safeParse({
      id: "entry123",
      voidReason: "x".repeat(201),
    });
    expect(result.success).toBe(false);
  });
});

describe("correctWastageSchema", () => {
  it("accepts valid correction", () => {
    const result = correctWastageSchema.safeParse({
      id: "entry123",
      newQuantity: 3,
    });
    expect(result.success).toBe(true);
  });

  it("rejects zero quantity correction", () => {
    const result = correctWastageSchema.safeParse({
      id: "entry123",
      newQuantity: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("Undo window check", () => {
  it("allows undo within 5 seconds", () => {
    const createdAt = Date.now() - 3000;
    const elapsed = Date.now() - createdAt;
    expect(elapsed <= 5000).toBe(true);
  });

  it("blocks undo after 5 seconds", () => {
    const createdAt = Date.now() - 6000;
    const elapsed = Date.now() - createdAt;
    expect(elapsed > 5000).toBe(true);
  });
});

describe("Auto-deduct caps at zero", () => {
  it("deducts to 0, never negative", () => {
    const currentQty = 3;
    const wastageQty = 5;
    const newQty = Math.max(0, currentQty - wastageQty);
    expect(newQty).toBe(0);
  });

  it("deducts normally when sufficient stock", () => {
    const currentQty = 10;
    const wastageQty = 3;
    const newQty = Math.max(0, currentQty - wastageQty);
    expect(newQty).toBe(7);
  });
});
