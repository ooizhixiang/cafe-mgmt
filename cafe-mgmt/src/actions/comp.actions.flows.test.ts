import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    compEntry: { findFirst: vi.fn(), update: vi.fn() },
    cafe: { findUnique: vi.fn() },
    ingredient: { findFirst: vi.fn() },
    compBudget: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn(),
  requireRole: vi.fn(),
}));

vi.mock("@/lib/format", () => ({
  getCafeNow: () => new Date("2026-04-27T08:00:00Z"),
}));

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { undoComp } from "./comp.actions";

const mockSession = {
  user: { id: "user-1", cafeId: "cafe-1", role: "STAFF" as const },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue(mockSession as never);
});

describe("undoComp — Patch 6 (already-voided guard)", () => {
  it("returns 'Already voided' when the comp entry is already voided", async () => {
    vi.mocked(prisma.compEntry.findFirst).mockResolvedValue({
      id: "comp-1",
      cafeId: "cafe-1",
      ingredientId: "ing-1",
      quantity: 2,
      voidedAt: new Date("2026-04-27T07:00:00Z"),
      deletedAt: null,
      createdAt: new Date("2026-04-27T07:55:00Z"), // recent — undo window OK
    } as never);

    const txCallback = vi.fn();
    vi.mocked(prisma.$transaction).mockImplementation(txCallback);

    const result = await undoComp("comp-1");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Already voided");
    }
    // No transaction should have been opened.
    expect(txCallback).not.toHaveBeenCalled();
  });

  it("returns 'Entry not found' when the comp entry doesn't exist", async () => {
    vi.mocked(prisma.compEntry.findFirst).mockResolvedValue(null);

    const result = await undoComp("nope");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Entry not found");
    }
  });
});
