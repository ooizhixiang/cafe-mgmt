import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/actions/stocktake.actions", () => ({
  saveStocktakeItemCount: vi.fn(),
  completeStocktake: vi.fn(),
  cancelStocktake: vi.fn(),
}));

const toastSpy = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: toastSpy }),
}));

const routerPush = vi.fn();
const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, refresh: routerRefresh }),
  useSearchParams: () => new URLSearchParams(""),
}));

import { StocktakeTable } from "./stocktake-table";
import {
  saveStocktakeItemCount,
  completeStocktake,
  type StocktakeView,
} from "@/actions/stocktake.actions";

function buildView(overrides: Partial<StocktakeView> = {}): StocktakeView {
  return {
    stocktake: {
      id: "st-1",
      status: "IN_PROGRESS",
      startedAt: new Date("2026-05-08T08:00:00Z").toISOString(),
      startedByName: "Mgr",
      totalItems: 2,
      countedItems: 0,
      uncountedItems: 2,
    },
    items: [
      {
        id: "item-1",
        ingredientId: "ing-a",
        ingredientName: "Milk",
        ingredientUnit: "mL",
        sku: "SKU-A",
        barcode: "BAR-A",
        expectedQuantity: 5,
        countedQuantity: null,
        confirmedAt: null,
      },
      {
        id: "item-2",
        ingredientId: "ing-b",
        ingredientName: "Sugar",
        ingredientUnit: "g",
        sku: null,
        barcode: null,
        expectedQuantity: 10,
        countedQuantity: null,
        confirmedAt: null,
      },
    ],
    page: 1,
    totalPages: 1,
    totalRecords: 2,
    pageSize: 10,
    tab: "uncounted",
    search: "",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("StocktakeTable", () => {
  it("renders rows with name, SKU, barcode, expected qty, and a Confirm button that calls saveStocktakeItemCount", async () => {
    vi.mocked(saveStocktakeItemCount).mockResolvedValue({
      success: true,
      data: { id: "item-1" },
    });

    render(<StocktakeTable view={buildView()} />);

    expect(screen.getByText(/Milk/)).not.toBeNull();
    expect(screen.getByText("SKU-A")).not.toBeNull();
    expect(screen.getByText("BAR-A")).not.toBeNull();
    expect(screen.getByText(/Sugar/)).not.toBeNull();

    const milkInput = screen.getByLabelText(
      /Counted quantity for Milk/
    ) as HTMLInputElement;
    fireEvent.change(milkInput, { target: { value: "4" } });

    const confirmButtons = screen.getAllByRole("button", { name: /^Confirm$/ });
    fireEvent.click(confirmButtons[0]);

    await waitFor(() =>
      expect(saveStocktakeItemCount).toHaveBeenCalledWith({
        itemId: "item-1",
        quantity: 4,
      })
    );
  });

  it("Mark As Completed shows the confirm dialog when uncounted items remain", async () => {
    render(<StocktakeTable view={buildView()} />);

    fireEvent.click(screen.getByRole("button", { name: /Mark As Completed/i }));

    expect(
      screen.getByText(/2 items still uncounted/)
    ).not.toBeNull();
    // completeStocktake should NOT have been called yet — the dialog gates it.
    expect(completeStocktake).not.toHaveBeenCalled();
  });
});
