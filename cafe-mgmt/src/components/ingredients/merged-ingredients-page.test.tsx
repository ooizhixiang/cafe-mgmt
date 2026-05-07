import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Stub the heavy sub-components — this test focuses on the toggle/role logic,
// not on rendering the full spreadsheet/list trees (those have their own
// dedicated tests). Stubs let us assert which view is mounted via testid.
vi.mock("@/components/ingredients/ingredient-spreadsheet", () => ({
  IngredientSpreadsheet: () => <div data-testid="spreadsheet" />,
}));

vi.mock("@/components/inventory/inventory-list", () => ({
  InventoryList: () => <div data-testid="count-list" />,
}));

import { MergedIngredientsPage } from "./merged-ingredients-page";

const spreadsheetProps = {
  initialIngredients: [],
  suppliers: [],
  distinctCategories: [],
  enabledUnits: [],
};

const inventoryListProps = {
  initialIngredients: [],
  suppliers: [],
  userRole: "MANAGER" as const,
  enabledUnits: [],
};

const inventoryListPropsStaff = {
  ...inventoryListProps,
  userRole: "STAFF" as const,
};

beforeEach(() => {
  // jsdom shares one localStorage instance across tests; clear it so the
  // view preference doesn't leak between cases.
  try {
    localStorage.clear();
  } catch {}
  vi.restoreAllMocks();
});

describe("MergedIngredientsPage — manager", () => {
  it("renders the Spreadsheet | Count toggle and defaults to spreadsheet view", () => {
    render(
      <MergedIngredientsPage
        userRole="MANAGER"
        spreadsheetProps={spreadsheetProps}
        inventoryListProps={inventoryListProps}
      />
    );

    // Toggle is present (both manager-only buttons render).
    expect(screen.getByRole("button", { name: "Spreadsheet" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Count" })).toBeDefined();

    // Spreadsheet is the default view; Count list should not be in the DOM.
    expect(screen.getByTestId("spreadsheet")).toBeDefined();
    expect(screen.queryByTestId("count-list")).toBeNull();
  });
});

describe("MergedIngredientsPage — staff", () => {
  it("renders the count view and does NOT render the toggle", () => {
    render(
      <MergedIngredientsPage
        userRole="STAFF"
        spreadsheetProps={spreadsheetProps}
        inventoryListProps={inventoryListPropsStaff}
      />
    );

    // No toggle — staff has no choice.
    expect(screen.queryByRole("button", { name: "Spreadsheet" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Count" })).toBeNull();

    // Count view is rendered.
    expect(screen.getByTestId("count-list")).toBeDefined();
    expect(screen.queryByTestId("spreadsheet")).toBeNull();
  });
});

describe("MergedIngredientsPage — localStorage hydration", () => {
  it("manager with localStorage='count' renders count view from first paint after hydration", async () => {
    const getItemSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation((key) => (key === "ingredients.view" ? "count" : null));

    render(
      <MergedIngredientsPage
        userRole="MANAGER"
        spreadsheetProps={spreadsheetProps}
        inventoryListProps={inventoryListProps}
      />
    );

    // findByTestId waits for the post-mount useEffect to flush and swap views.
    expect(await screen.findByTestId("count-list")).toBeDefined();
    expect(screen.queryByTestId("spreadsheet")).toBeNull();

    // Toggle still shown for managers.
    expect(screen.getByRole("button", { name: "Spreadsheet" })).toBeDefined();

    expect(getItemSpy).toHaveBeenCalledWith("ingredients.view");
  });

  it("staff ignores localStorage='spreadsheet' and stays on count view", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation((key) =>
      key === "ingredients.view" ? "spreadsheet" : null
    );

    render(
      <MergedIngredientsPage
        userRole="STAFF"
        spreadsheetProps={spreadsheetProps}
        inventoryListProps={inventoryListPropsStaff}
      />
    );

    expect(screen.getByTestId("count-list")).toBeDefined();
    expect(screen.queryByTestId("spreadsheet")).toBeNull();
    expect(screen.queryByRole("button", { name: "Spreadsheet" })).toBeNull();
  });
});
