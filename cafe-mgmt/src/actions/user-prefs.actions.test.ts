import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    set: vi.fn(),
    get: vi.fn().mockReturnValue(undefined),
  }),
}));

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { toggleDarkMode, getDarkMode, updateLastSeen } from "./user-prefs.actions";

const mockSession = {
  user: { id: "user-1", cafeId: "cafe-1", role: "STAFF" as const },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue(mockSession);
});

describe("toggleDarkMode", () => {
  it("toggles from false to true", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ darkMode: false } as never);
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);

    const result = await toggleDarkMode();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.darkMode).toBe(true);
    }
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { darkMode: true },
    });
  });

  it("toggles from true to false", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ darkMode: true } as never);
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);

    const result = await toggleDarkMode();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.darkMode).toBe(false);
    }
  });

  it("treats null user as toggling to true", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);

    const result = await toggleDarkMode();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.darkMode).toBe(true);
    }
  });
});

describe("getDarkMode", () => {
  it("returns user dark mode preference", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ darkMode: true } as never);

    const result = await getDarkMode();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.darkMode).toBe(true);
    }
  });

  it("defaults to false if user not found", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const result = await getDarkMode();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.darkMode).toBe(false);
    }
  });
});

describe("updateLastSeen", () => {
  it("updates user lastSeenAt", async () => {
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);

    const result = await updateLastSeen();
    expect(result.success).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { lastSeenAt: expect.any(Date) },
    });
  });
});
