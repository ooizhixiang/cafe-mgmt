import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// ─── Mocks for setCafeEnabledUnits ──────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    cafe: { update: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({
  requireRole: vi.fn(),
}));

vi.mock("@/lib/log-error", () => ({
  logError: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { setCafeEnabledUnits, setMinMarginPercent } from "./setup.actions";
import { revalidatePath } from "next/cache";

// Test Zod schemas used by IngredientSupplier CRUD actions

const addIngredientSupplierSchema = z.object({
  ingredientId: z.string().min(1),
  supplierId: z.string().min(1),
  priceInCents: z.number().min(0),
  unit: z.string().min(1).max(20),
});

const updateIngredientSupplierSchema = z.object({
  id: z.string().min(1),
  priceInCents: z.number().min(0),
  unit: z.string().min(1).max(20),
});

const removeIngredientSupplierSchema = z.object({
  id: z.string().min(1),
});

describe("addIngredientSupplierSchema", () => {
  it("accepts a valid payload", () => {
    const result = addIngredientSupplierSchema.safeParse({
      ingredientId: "ing1",
      supplierId: "sup1",
      priceInCents: 1500,
      unit: "kg",
    });
    expect(result.success).toBe(true);
  });

  it("accepts zero price", () => {
    const result = addIngredientSupplierSchema.safeParse({
      ingredientId: "ing1",
      supplierId: "sup1",
      priceInCents: 0,
      unit: "kg",
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative price", () => {
    const result = addIngredientSupplierSchema.safeParse({
      ingredientId: "ing1",
      supplierId: "sup1",
      priceInCents: -1,
      unit: "kg",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty ingredientId", () => {
    const result = addIngredientSupplierSchema.safeParse({
      ingredientId: "",
      supplierId: "sup1",
      priceInCents: 100,
      unit: "kg",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty supplierId", () => {
    const result = addIngredientSupplierSchema.safeParse({
      ingredientId: "ing1",
      supplierId: "",
      priceInCents: 100,
      unit: "kg",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty unit", () => {
    const result = addIngredientSupplierSchema.safeParse({
      ingredientId: "ing1",
      supplierId: "sup1",
      priceInCents: 100,
      unit: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unit over 20 chars", () => {
    const result = addIngredientSupplierSchema.safeParse({
      ingredientId: "ing1",
      supplierId: "sup1",
      priceInCents: 100,
      unit: "x".repeat(21),
    });
    expect(result.success).toBe(false);
  });

  it("accepts fractional (sub-cent) price", () => {
    const result = addIngredientSupplierSchema.safeParse({
      ingredientId: "ing1",
      supplierId: "sup1",
      priceInCents: 0.5,
      unit: "kg",
    });
    expect(result.success).toBe(true);
  });
});

describe("updateIngredientSupplierSchema", () => {
  it("accepts valid update", () => {
    const result = updateIngredientSupplierSchema.safeParse({
      id: "link1",
      priceInCents: 2500,
      unit: "lb",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing id", () => {
    const result = updateIngredientSupplierSchema.safeParse({
      id: "",
      priceInCents: 2500,
      unit: "lb",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative price", () => {
    const result = updateIngredientSupplierSchema.safeParse({
      id: "link1",
      priceInCents: -10,
      unit: "lb",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty unit", () => {
    const result = updateIngredientSupplierSchema.safeParse({
      id: "link1",
      priceInCents: 1000,
      unit: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("removeIngredientSupplierSchema", () => {
  it("accepts a valid id", () => {
    const result = removeIngredientSupplierSchema.safeParse({ id: "link1" });
    expect(result.success).toBe(true);
  });

  it("rejects empty id", () => {
    const result = removeIngredientSupplierSchema.safeParse({ id: "" });
    expect(result.success).toBe(false);
  });
});

// addIngredient now requires a non-empty category — schema enforces it.
const addIngredientSchema = z.object({
  name: z.string().min(1, "Name is required"),
  unit: z.string().min(1, "Unit is required"),
  category: z.string().trim().min(1, "Category required"),
});

describe("addIngredientSchema", () => {
  it("accepts a valid payload with category", () => {
    const result = addIngredientSchema.safeParse({
      name: "Milk",
      unit: "L",
      category: "Dairy",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty category with 'Category required'", () => {
    const result = addIngredientSchema.safeParse({
      name: "Milk",
      unit: "L",
      category: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Category required");
    }
  });

  it("rejects whitespace-only category", () => {
    const result = addIngredientSchema.safeParse({
      name: "Milk",
      unit: "L",
      category: "   ",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing name", () => {
    const result = addIngredientSchema.safeParse({
      name: "",
      unit: "L",
      category: "Dairy",
    });
    expect(result.success).toBe(false);
  });
});

// ─── setCafeEnabledUnits ───────────────────────────────────

describe("setCafeEnabledUnits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue({
      user: { id: "u1", cafeId: "cafe-1", role: "MANAGER" as const },
    } as never);
  });

  it("happy path: persists the cleaned list and returns the new enabledUnits", async () => {
    vi.mocked(prisma.cafe.update).mockResolvedValue({
      enabledUnits: ["kg", "g", "L", "tsp"],
    } as never);

    const result = await setCafeEnabledUnits(["kg", "g", "L", "tsp"]);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.enabledUnits).toEqual(["kg", "g", "L", "tsp"]);
    expect(prisma.cafe.update).toHaveBeenCalledWith({
      where: { id: "cafe-1" },
      data: { enabledUnits: ["kg", "g", "L", "tsp"] },
      select: { enabledUnits: true },
    });
  });

  it("de-dupes silently before persisting", async () => {
    vi.mocked(prisma.cafe.update).mockResolvedValue({
      enabledUnits: ["kg", "g"],
    } as never);

    await setCafeEnabledUnits(["kg", "g", "kg"]);
    const call = vi.mocked(prisma.cafe.update).mock.calls[0]![0]!;
    const data = (call as { data: { enabledUnits: string[] } }).data;
    expect(data.enabledUnits).toEqual(["kg", "g"]);
  });

  it("accepts empty array (manager wants no enabled units — settings UI warns elsewhere)", async () => {
    vi.mocked(prisma.cafe.update).mockResolvedValue({
      enabledUnits: [],
    } as never);
    const result = await setCafeEnabledUnits([]);
    expect(result.success).toBe(true);
  });

  it("rejects STAFF caller (Unauthorized)", async () => {
    vi.mocked(requireRole).mockRejectedValueOnce(new Error("Unauthorized"));
    const result = await setCafeEnabledUnits(["kg"]);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("Unauthorized");
    expect(prisma.cafe.update).not.toHaveBeenCalled();
  });

  it("rejects an entry containing whitespace", async () => {
    const result = await setCafeEnabledUnits(["kg", "fl oz"]);
    expect(result.success).toBe(false);
    expect(prisma.cafe.update).not.toHaveBeenCalled();
  });

  it("rejects non-array input", async () => {
    const result = await setCafeEnabledUnits("kg" as unknown as string[]);
    expect(result.success).toBe(false);
    expect(prisma.cafe.update).not.toHaveBeenCalled();
  });

  it("rejects more than 50 entries", async () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => `u${i}`);
    const result = await setCafeEnabledUnits(tooMany);
    expect(result.success).toBe(false);
  });

  it("returns generic error when prisma update throws", async () => {
    vi.mocked(prisma.cafe.update).mockRejectedValue(new Error("boom"));
    const result = await setCafeEnabledUnits(["kg"]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Something went wrong. Please try again.");
    }
  });

  it("revalidates every page that pickers units (so stale tabs refresh)", async () => {
    vi.mocked(prisma.cafe.update).mockResolvedValue({
      enabledUnits: ["kg"],
    } as never);
    await setCafeEnabledUnits(["kg"]);
    const calls = vi.mocked(revalidatePath).mock.calls.map((c) => c[0]);
    expect(calls).toContain("/settings");
    expect(calls).toContain("/purchases");
    expect(calls).toContain("/ingredients");
    expect(calls).toContain("/suppliers");
    // Dynamic route uses the "page" type for Next's path matcher
    expect(calls).toContain("/suppliers/[id]");
  });
});

// ─── setMinMarginPercent ──────────────────────────────────

describe("setMinMarginPercent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue({
      user: { id: "u1", cafeId: "cafe-1", role: "MANAGER" as const },
    } as never);
  });

  it("happy path: persists the new floor and revalidates feed routes", async () => {
    vi.mocked(prisma.cafe.update).mockResolvedValue({
      minMarginPercent: 30,
    } as never);

    const result = await setMinMarginPercent(30);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.minMarginPercent).toBe(30);
    expect(prisma.cafe.update).toHaveBeenCalledWith({
      where: { id: "cafe-1" },
      data: { minMarginPercent: 30 },
      select: { minMarginPercent: true },
    });
    const calls = vi.mocked(revalidatePath).mock.calls.map((c) => c[0]);
    expect(calls).toContain("/settings");
    expect(calls).toContain("/");
  });

  it("accepts boundary values (0 and 99)", async () => {
    vi.mocked(prisma.cafe.update).mockResolvedValue({
      minMarginPercent: 0,
    } as never);
    expect((await setMinMarginPercent(0)).success).toBe(true);
    vi.mocked(prisma.cafe.update).mockResolvedValue({
      minMarginPercent: 99,
    } as never);
    expect((await setMinMarginPercent(99)).success).toBe(true);
  });

  it("rejects values outside 0..99", async () => {
    expect((await setMinMarginPercent(-1)).success).toBe(false);
    expect((await setMinMarginPercent(100)).success).toBe(false);
    expect((await setMinMarginPercent(150)).success).toBe(false);
    expect(prisma.cafe.update).not.toHaveBeenCalled();
  });

  it("rejects non-integer values", async () => {
    expect((await setMinMarginPercent(20.5)).success).toBe(false);
    expect(prisma.cafe.update).not.toHaveBeenCalled();
  });

  it("rejects STAFF caller (Unauthorized)", async () => {
    vi.mocked(requireRole).mockRejectedValueOnce(new Error("Unauthorized"));
    const result = await setMinMarginPercent(30);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("Unauthorized");
    expect(prisma.cafe.update).not.toHaveBeenCalled();
  });

  it("returns generic error when prisma update throws", async () => {
    vi.mocked(prisma.cafe.update).mockRejectedValue(new Error("boom"));
    const result = await setMinMarginPercent(20);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Something went wrong. Please try again.");
    }
  });
});
