import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/actions/inventory.actions", () => ({
  getInventoryLog: vi.fn(),
}));

const toastSpy = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: toastSpy }),
}));

import { InventoryLog } from "./inventory-log";
import {
  getInventoryLog,
  type InventoryLogEntry,
} from "@/actions/inventory.actions";

function makeEntry(over: Partial<InventoryLogEntry> = {}): InventoryLogEntry {
  return {
    kind: "loss",
    id: "wastage:w1",
    ingredientName: "Milk",
    ingredientUnit: "mL",
    quantity: 100,
    dollarValueInCents: 250,
    createdAt: new Date().toISOString(),
    description: "Spilled",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("InventoryLog", () => {
  it("renders rows from initialEntries and shows 'Show more' when nextCursor is non-null", () => {
    render(
      <InventoryLog
        initialEntries={[
          makeEntry({ id: "wastage:w1", ingredientName: "Milk", kind: "loss" }),
          makeEntry({
            id: "purchase:p1",
            ingredientName: "Coffee",
            kind: "add",
            quantity: 1000,
            ingredientUnit: "g",
            dollarValueInCents: 1500,
            description: "Acme",
          }),
        ]}
        initialNextCursor={30}
      />
    );

    expect(screen.getByText("Milk")).not.toBeNull();
    expect(screen.getByText("Coffee")).not.toBeNull();
    expect(screen.getByText("Loss")).not.toBeNull();
    expect(screen.getByText("Add")).not.toBeNull();
    expect(screen.getByRole("button", { name: /show more/i })).not.toBeNull();
  });

  it("renders empty state when no entries and no Show more button", () => {
    render(<InventoryLog initialEntries={[]} initialNextCursor={null} />);
    expect(screen.getByText(/No inventory changes yet/)).not.toBeNull();
    expect(screen.queryByRole("button", { name: /show more/i })).toBeNull();
  });

  it("clicking 'Show more' calls getInventoryLog, appends entries, and hides the button when nextCursor becomes null", async () => {
    vi.mocked(getInventoryLog).mockResolvedValue({
      success: true,
      data: {
        entries: [
          makeEntry({
            id: "wastage:w2",
            ingredientName: "Sugar",
            kind: "loss",
          }),
        ],
        nextCursor: null,
      },
    });

    render(
      <InventoryLog
        initialEntries={[
          makeEntry({ id: "wastage:w1", ingredientName: "Milk" }),
        ]}
        initialNextCursor={30}
      />
    );

    const button = screen.getByRole("button", { name: /show more/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(vi.mocked(getInventoryLog)).toHaveBeenCalledWith({ cursor: 30 });
    });

    await waitFor(() => {
      expect(screen.getByText("Sugar")).not.toBeNull();
    });

    // Original entry still rendered
    expect(screen.getByText("Milk")).not.toBeNull();
    // Button should disappear once nextCursor is null
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /show more/i })).toBeNull();
    });
  });
});
