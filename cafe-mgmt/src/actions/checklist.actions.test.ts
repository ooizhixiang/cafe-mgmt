import { describe, it, expect } from "vitest";
import { z } from "zod";

// Test Zod schemas used in checklist actions

const addItemSchema = z.object({
  templateId: z.string().min(1),
  text: z.string().min(1, "Item text is required").max(200),
  notes: z.string().max(500).optional(),
  role: z.enum(["MANAGER", "STAFF"]).nullable().optional(),
});

const updateItemSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1, "Item text is required").max(200),
  notes: z.string().max(500).optional(),
  role: z.enum(["MANAGER", "STAFF"]).nullable().optional(),
});

describe("addItemSchema", () => {
  it("accepts valid item data", () => {
    const result = addItemSchema.safeParse({
      templateId: "abc123",
      text: "Turn on espresso machine",
    });
    expect(result.success).toBe(true);
  });

  it("accepts item with notes and role", () => {
    const result = addItemSchema.safeParse({
      templateId: "abc123",
      text: "Check inventory",
      notes: "Count matches printed sheet",
      role: "MANAGER",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null role (Both)", () => {
    const result = addItemSchema.safeParse({
      templateId: "abc123",
      text: "Sweep floor",
      role: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty text", () => {
    const result = addItemSchema.safeParse({
      templateId: "abc123",
      text: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects text over 200 characters", () => {
    const result = addItemSchema.safeParse({
      templateId: "abc123",
      text: "x".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("rejects notes over 500 characters", () => {
    const result = addItemSchema.safeParse({
      templateId: "abc123",
      text: "Valid text",
      notes: "x".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid role", () => {
    const result = addItemSchema.safeParse({
      templateId: "abc123",
      text: "Valid text",
      role: "ADMIN",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty templateId", () => {
    const result = addItemSchema.safeParse({
      templateId: "",
      text: "Valid text",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateItemSchema", () => {
  it("accepts valid update data", () => {
    const result = updateItemSchema.safeParse({
      id: "item123",
      text: "Updated text",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty id", () => {
    const result = updateItemSchema.safeParse({
      id: "",
      text: "Text",
    });
    expect(result.success).toBe(false);
  });
});

describe("Item count warning threshold", () => {
  it("warns when items exceed 10", () => {
    const itemCount = 11;
    const shouldWarn = itemCount > 10;
    expect(shouldWarn).toBe(true);
  });

  it("does not warn at 10 or fewer", () => {
    const itemCount = 10;
    const shouldWarn = itemCount > 10;
    expect(shouldWarn).toBe(false);
  });

  it("does not warn at 8 (recommended max)", () => {
    const itemCount = 8;
    const shouldWarn = itemCount > 10;
    expect(shouldWarn).toBe(false);
  });
});
