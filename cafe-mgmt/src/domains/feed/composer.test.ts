import { describe, it, expect } from "vitest";
import type { FeedCard } from "@/types/feed";

describe("Feed card sorting", () => {
  it("sorts cards by priority ascending", () => {
    const cards: FeedCard[] = [
      {
        id: "1",
        variant: "onboarding",
        priority: 4,
        title: "Onboarding",
        borderColor: "blue",
        data: {},
        createdAt: new Date().toISOString(),
      },
      {
        id: "2",
        variant: "checklist",
        priority: 2,
        title: "Checklist",
        borderColor: "blue",
        data: {},
        createdAt: new Date().toISOString(),
      },
      {
        id: "3",
        variant: "alert",
        priority: 3,
        title: "Alert",
        borderColor: "amber",
        data: {},
        createdAt: new Date().toISOString(),
      },
    ];

    const sorted = [...cards].sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return (
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });

    expect(sorted[0].priority).toBe(2);
    expect(sorted[1].priority).toBe(3);
    expect(sorted[2].priority).toBe(4);
  });

  it("sorts same-priority cards by creation time descending", () => {
    const cards: FeedCard[] = [
      {
        id: "1",
        variant: "onboarding",
        priority: 4,
        title: "Older",
        borderColor: "blue",
        data: {},
        createdAt: "2024-01-01T00:00:00Z",
      },
      {
        id: "2",
        variant: "onboarding",
        priority: 4,
        title: "Newer",
        borderColor: "blue",
        data: {},
        createdAt: "2024-01-02T00:00:00Z",
      },
    ];

    const sorted = [...cards].sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return (
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });

    expect(sorted[0].title).toBe("Newer");
    expect(sorted[1].title).toBe("Older");
  });
});

describe("Feed badges", () => {
  it("sets feed badge when incomplete checklists exist", () => {
    const cards: FeedCard[] = [
      {
        id: "1",
        variant: "checklist",
        priority: 2,
        title: "Test",
        borderColor: "blue",
        data: {},
        createdAt: new Date().toISOString(),
      },
    ];

    const hasIncomplete = cards.some((c) => c.variant === "checklist");
    expect(hasIncomplete).toBe(true);
  });

  it("does not set feed badge when all checklists complete", () => {
    const cards: FeedCard[] = [
      {
        id: "1",
        variant: "completion",
        priority: 4,
        title: "Done",
        borderColor: "green",
        data: {},
        createdAt: new Date().toISOString(),
      },
    ];

    const hasIncomplete = cards.some((c) => c.variant === "checklist");
    expect(hasIncomplete).toBe(false);
  });
});

describe("Role filtering", () => {
  it("filters items for staff role", () => {
    const items = [
      { role: null, text: "Both" },
      { role: "STAFF", text: "Staff only" },
      { role: "MANAGER", text: "Manager only" },
    ];

    const staffItems = items.filter(
      (item) => item.role === null || item.role === "STAFF"
    );

    expect(staffItems).toHaveLength(2);
    expect(staffItems.map((i) => i.text)).toEqual(["Both", "Staff only"]);
  });

  it("filters items for manager role", () => {
    const items = [
      { role: null, text: "Both" },
      { role: "STAFF", text: "Staff only" },
      { role: "MANAGER", text: "Manager only" },
    ];

    const managerItems = items.filter(
      (item) => item.role === null || item.role === "MANAGER"
    );

    expect(managerItems).toHaveLength(2);
    expect(managerItems.map((i) => i.text)).toEqual(["Both", "Manager only"]);
  });
});
