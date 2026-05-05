import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

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
