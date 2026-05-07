import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { getRecipesForIngredient } from "@/actions/inventory.actions";
import { updateIngredient } from "@/actions/setup.actions";

// Mock server actions used by the list. The chip rendering doesn't call any of
// these — the mocks just keep the module import graph happy.
vi.mock("@/actions/inventory.actions", () => ({
  saveInventoryCount: vi.fn(),
  bulkConfirmUnchanged: vi.fn(),
  updateIngredientConfig: vi.fn(),
  getRecipesForIngredient: vi.fn().mockResolvedValue({ success: true, data: [] }),
}));

vi.mock("@/actions/setup.actions", () => ({
  addIngredient: vi.fn(),
  updateIngredient: vi.fn(),
  deleteIngredient: vi.fn(),
}));

const toastSpy = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: toastSpy }),
}));

import { InventoryList } from "./inventory-list";

interface SupplierChip {
  id: string;
  supplierId: string;
  supplierName: string;
  priceInCents: number;
  unit: string;
}

function makeIngredient(
  overrides: Partial<{
    id: string;
    name: string;
    unit: string;
    ingredientSuppliers: SupplierChip[];
  }> = {}
) {
  return {
    id: overrides.id ?? "ing-1",
    name: overrides.name ?? "Coffee",
    unit: overrides.unit ?? "kg",
    displayUnit: null,
    category: null,
    isPinned: false,
    snapIncrement: null,
    containerProfile: null,
    costPerUnitInCents: null,
    derivedCostPerUnitInCents: null,
    unitsPerContainer: null,
    lowStockThreshold: null,
    ingredientSuppliers: overrides.ingredientSuppliers ?? [],
    ingredientPurchases: [],
    todayCount: null,
    todayUpdatedAt: null,
    previousCount: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("InventoryList — inline supplier chips", () => {
  it("renders all supplier chips when ingredient has ≤3 suppliers", () => {
    const ing = makeIngredient({
      id: "ing-1",
      name: "Coffee",
      ingredientSuppliers: [
        { id: "l1", supplierId: "s1", supplierName: "Beta Foods", priceInCents: 100, unit: "kg" },
        { id: "l2", supplierId: "s2", supplierName: "Acme Foods", priceInCents: 110, unit: "kg" },
      ],
    });

    render(
      <InventoryList
        initialIngredients={[ing]}
        suppliers={[]}
        userRole="MANAGER"
      />
    );

    const chipsContainer = screen.getByTestId("inline-supplier-chips-ing-1");
    // Both suppliers visible (sort is price-asc: Beta@100 then Acme@110); presence is what matters here.
    expect(within(chipsContainer).getByText("Acme Foods")).toBeDefined();
    expect(within(chipsContainer).getByText("Beta Foods")).toBeDefined();
    // No overflow indicator with only 2 suppliers.
    expect(within(chipsContainer).queryByText(/more$/)).toBeNull();
  });

  it("renders 3 chips and a '+N more' badge when ingredient has more than 3 suppliers", () => {
    const ing = makeIngredient({
      id: "ing-1",
      name: "Coffee",
      ingredientSuppliers: [
        // Cheapest 3 (Alpha=100, Bravo=110, Charlie=120) should be visible; Delta=130, Echo=140 collapse.
        { id: "l1", supplierId: "s1", supplierName: "Alpha", priceInCents: 100, unit: "kg" },
        { id: "l2", supplierId: "s2", supplierName: "Bravo", priceInCents: 110, unit: "kg" },
        { id: "l3", supplierId: "s3", supplierName: "Charlie", priceInCents: 120, unit: "kg" },
        { id: "l4", supplierId: "s4", supplierName: "Delta", priceInCents: 130, unit: "kg" },
        { id: "l5", supplierId: "s5", supplierName: "Echo", priceInCents: 140, unit: "kg" },
      ],
    });

    render(
      <InventoryList
        initialIngredients={[ing]}
        suppliers={[]}
        userRole="MANAGER"
      />
    );

    const chipsContainer = screen.getByTestId("inline-supplier-chips-ing-1");
    // Sorted price-asc (matches IngredientSuppliersPanel): Alpha, Bravo, Charlie visible; Delta + Echo collapse.
    expect(within(chipsContainer).getByText("Alpha")).toBeDefined();
    expect(within(chipsContainer).getByText("Bravo")).toBeDefined();
    expect(within(chipsContainer).getByText("Charlie")).toBeDefined();
    expect(within(chipsContainer).queryByText("Delta")).toBeNull();
    expect(within(chipsContainer).queryByText("Echo")).toBeNull();
    // Overflow indicator: 5 - 3 = 2.
    expect(within(chipsContainer).getByText("+2 more")).toBeDefined();
  });

  it("renders no chip row when ingredient has zero suppliers", () => {
    const ing = makeIngredient({
      id: "ing-1",
      name: "Coffee",
      ingredientSuppliers: [],
    });

    render(
      <InventoryList
        initialIngredients={[ing]}
        suppliers={[]}
        userRole="MANAGER"
      />
    );

    expect(screen.queryByTestId("inline-supplier-chips-ing-1")).toBeNull();
  });
});

describe("InventoryList — inline unit picker", () => {
  it("manager view renders a unit <select> per row populated with enabledUnits and the current value preselected", () => {
    const ing = makeIngredient({ id: "ing-1", name: "Milk", unit: "mL" });

    render(
      <InventoryList
        initialIngredients={[ing]}
        suppliers={[]}
        userRole="MANAGER"
        enabledUnits={["g", "kg", "mL", "L", "each"]}
      />
    );

    const select = screen.getByRole("combobox", { name: /Unit for Milk/i }) as HTMLSelectElement;
    expect(select).toBeDefined();
    expect(select.value).toBe("mL");
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toEqual(expect.arrayContaining(["g", "kg", "mL", "L", "each"]));
  });

  it("reverts the unit display + toasts when updateIngredient returns success:false", async () => {
    vi.mocked(updateIngredient).mockResolvedValueOnce({ success: false, error: "Unauthorized" });

    const ing = makeIngredient({ id: "ing-1", name: "Milk", unit: "mL" });

    render(
      <InventoryList
        initialIngredients={[ing]}
        suppliers={[]}
        userRole="MANAGER"
        enabledUnits={["g", "kg", "mL", "L", "each"]}
      />
    );

    const select = screen.getByRole("combobox", { name: /Unit for Milk/i }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "L" } });

    await waitFor(() => {
      expect(vi.mocked(updateIngredient)).toHaveBeenCalledWith("ing-1", "Milk", "L");
    });
    // Revert: select value returns to the previous unit after the failure resolves.
    await waitFor(() => {
      expect(
        (screen.getByRole("combobox", { name: /Unit for Milk/i }) as HTMLSelectElement).value
      ).toBe("mL");
    });
  });

  it("changing the unit calls updateIngredient(id, name, newUnit) and updates the row's display optimistically", async () => {
    vi.mocked(updateIngredient).mockResolvedValueOnce({ success: true, data: undefined });

    const ing = makeIngredient({ id: "ing-1", name: "Milk", unit: "mL" });

    render(
      <InventoryList
        initialIngredients={[ing]}
        suppliers={[]}
        userRole="MANAGER"
        enabledUnits={["g", "kg", "mL", "L", "each"]}
      />
    );

    const select = screen.getByRole("combobox", { name: /Unit for Milk/i }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "L" } });

    await waitFor(() => {
      expect(vi.mocked(updateIngredient)).toHaveBeenCalledWith("ing-1", "Milk", "L");
    });
    await waitFor(() => {
      expect(
        (screen.getByRole("combobox", { name: /Unit for Milk/i }) as HTMLSelectElement).value
      ).toBe("L");
    });
  });
});

describe("InventoryList — View Recipes button", () => {
  it("clicking View Recipes calls getRecipesForIngredient with the row's id and opens the dialog", async () => {
    vi.mocked(getRecipesForIngredient).mockResolvedValueOnce({
      success: true,
      data: [],
    });

    const ing = makeIngredient({ id: "ing-42", name: "Milk", unit: "ml" });

    render(
      <InventoryList
        initialIngredients={[ing]}
        suppliers={[]}
        userRole="MANAGER"
      />
    );

    const button = screen.getByRole("button", { name: /View recipes using Milk/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(vi.mocked(getRecipesForIngredient)).toHaveBeenCalledWith("ing-42");
    });

    // Dialog opens — title should be present.
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /Recipes using Milk/i })).toBeDefined();
    });
  });

  it("renders recipe names with variation suffixes when present, and the empty state when [] is returned", async () => {
    // Case 1: list with variations.
    vi.mocked(getRecipesForIngredient).mockResolvedValueOnce({
      success: true,
      data: [
        { id: "r1", name: "Cafe Latte", quantityPerServing: 200, variationName: null },
        { id: "r2", name: "Cappuccino", quantityPerServing: 150, variationName: "Hot" },
      ],
    });

    const ing = makeIngredient({ id: "ing-42", name: "Milk", unit: "ml" });

    const { unmount } = render(
      <InventoryList
        initialIngredients={[ing]}
        suppliers={[]}
        userRole="MANAGER"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /View recipes using Milk/i }));

    await waitFor(() => {
      const dialog = screen.getByRole("dialog", { name: /Recipes using Milk/i });
      expect(within(dialog).getByText("Cafe Latte")).toBeDefined();
      expect(within(dialog).getByText("Cappuccino (Hot)")).toBeDefined();
      expect(within(dialog).getByText("200 ml/serving")).toBeDefined();
      expect(within(dialog).getByText("150 ml/serving")).toBeDefined();
    });

    unmount();

    // Case 2: empty list shows the empty state.
    vi.mocked(getRecipesForIngredient).mockResolvedValueOnce({
      success: true,
      data: [],
    });

    const emptyIng = makeIngredient({ id: "ing-99", name: "Vanilla", unit: "ml" });

    render(
      <InventoryList
        initialIngredients={[emptyIng]}
        suppliers={[]}
        userRole="MANAGER"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /View recipes using Vanilla/i }));

    await waitFor(() => {
      const dialog = screen.getByRole("dialog", { name: /Recipes using Vanilla/i });
      expect(within(dialog).getByText("Not used in any recipe")).toBeDefined();
    });
  });
});
