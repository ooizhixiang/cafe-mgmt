import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock server actions
vi.mock("@/actions/setup.actions", () => ({
  addIngredientSupplier: vi.fn(),
  updateIngredientSupplier: vi.fn(),
  removeIngredientSupplier: vi.fn(),
}));

vi.mock("@/actions/supplier.actions", () => ({
  updateSupplier: vi.fn(),
}));

// Mock toast
const toastSpy = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: toastSpy }),
}));

// Mock next/navigation — useRouter requires the app router context which jsdom doesn't provide
const refreshSpy = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshSpy, push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

import {
  addIngredientSupplier,
  updateIngredientSupplier,
  removeIngredientSupplier,
} from "@/actions/setup.actions";
import { SupplierDetail } from "./supplier-detail";

const baseSupplier = {
  id: "sup1",
  name: "Acme Foods",
  phone: "555-1234",
  notes: null,
  reminderDays: 7,
  lastOrderDate: null,
  products: [
    {
      id: "link-milk",
      ingredientId: "ing-milk",
      ingredientName: "Milk",
      priceInCents: 350,
      unit: "L",
    },
    {
      id: "link-sugar",
      ingredientId: "ing-sugar",
      ingredientName: "Sugar",
      priceInCents: 200,
      unit: "kg",
    },
  ],
};

const allIngredients = [
  { id: "ing-flour", name: "Flour", unit: "kg" },
  { id: "ing-milk", name: "Milk", unit: "L" },
  { id: "ing-sugar", name: "Sugar", unit: "kg" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

function renderManager(overrides?: Partial<typeof baseSupplier>, ingredients = allIngredients) {
  return render(
    <SupplierDetail
      supplier={{ ...baseSupplier, ...overrides }}
      purchases={[]}
      allIngredients={ingredients}
      mode="manager"
    />
  );
}

describe("SupplierDetail — manager add product", () => {
  it("calls addIngredientSupplier with the right payload, appends row, excludes ingredient from picker, resets form", async () => {
    vi.mocked(addIngredientSupplier).mockResolvedValue({
      success: true,
      data: { id: "link-flour" },
    });

    renderManager();

    fireEvent.click(screen.getByRole("button", { name: /add product/i }));

    // Picker only has unlinked ingredients (Flour) since Milk + Sugar are linked
    const ingredientSelect = screen.getByLabelText("Ingredient") as HTMLSelectElement;
    const optionLabels = Array.from(ingredientSelect.options).map((o) => o.textContent?.trim());
    expect(optionLabels).toEqual(["Choose…", "Flour"]);

    fireEvent.change(ingredientSelect, { target: { value: "ing-flour" } });
    fireEvent.change(screen.getByLabelText("Price (RM)"), { target: { value: "5.50" } });
    fireEvent.change(screen.getByLabelText("Unit"), { target: { value: "kg" } });

    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(addIngredientSupplier).toHaveBeenCalledWith({
        ingredientId: "ing-flour",
        supplierId: "sup1",
        priceInCents: 550,
        unit: "kg",
      });
    });

    // Row appears
    await waitFor(() => {
      expect(screen.getByText("Flour")).toBeDefined();
    });
    expect(screen.getByText("RM 5.50/kg")).toBeDefined();

    // Form closed
    expect(screen.queryByLabelText("Ingredient")).toBeNull();

    // Re-open: picker now empty (all 3 ingredients linked) → button disabled, hint visible
    expect(
      screen.getByText(/all cafe ingredients are linked to this supplier/i)
    ).toBeDefined();
    const addBtn = screen.getByRole("button", { name: /add product/i }) as HTMLButtonElement;
    expect(addBtn.disabled).toBe(true);
  });

  it("toasts and keeps form open on add failure", async () => {
    vi.mocked(addIngredientSupplier).mockResolvedValue({
      success: false,
      error: "Supplier already added",
    });

    renderManager();

    fireEvent.click(screen.getByRole("button", { name: /add product/i }));
    fireEvent.change(screen.getByLabelText("Ingredient"), {
      target: { value: "ing-flour" },
    });
    fireEvent.change(screen.getByLabelText("Price (RM)"), { target: { value: "1.00" } });
    fireEvent.change(screen.getByLabelText("Unit"), { target: { value: "kg" } });

    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith("Supplier already added");
    });
    // Form is still open, values intact
    expect((screen.getByLabelText("Ingredient") as HTMLSelectElement).value).toBe("ing-flour");
    expect((screen.getByLabelText("Price (RM)") as HTMLInputElement).value).toBe("1.00");
    expect((screen.getByLabelText("Unit") as HTMLInputElement).value).toBe("kg");
  });
});

describe("SupplierDetail — manager edit product", () => {
  it("calls updateIngredientSupplier and updates the row in place", async () => {
    vi.mocked(updateIngredientSupplier).mockResolvedValue({
      success: true,
      data: undefined,
    });

    renderManager();

    fireEvent.click(screen.getByRole("button", { name: /edit milk/i }));

    const priceInput = screen.getByLabelText("Price (RM)") as HTMLInputElement;
    expect(priceInput.value).toBe("3.50");

    fireEvent.change(priceInput, { target: { value: "3.20" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(updateIngredientSupplier).toHaveBeenCalledWith({
        id: "link-milk",
        priceInCents: 320,
        unit: "L",
      });
    });

    // Row reverts to display mode and shows the new price
    await waitFor(() => {
      expect(screen.getByText("RM 3.20/L")).toBeDefined();
    });
    expect(screen.queryByLabelText("Price (RM)")).toBeNull();
  });

  it("toasts and stays in edit mode on update failure", async () => {
    vi.mocked(updateIngredientSupplier).mockResolvedValue({
      success: false,
      error: "Bad price",
    });

    renderManager();

    fireEvent.click(screen.getByRole("button", { name: /edit milk/i }));
    fireEvent.change(screen.getByLabelText("Price (RM)"), { target: { value: "3.20" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith("Bad price");
    });
    // Still in edit mode
    expect(screen.getByLabelText("Price (RM)")).toBeDefined();
    // Original row text gone (we're in edit mode), but display row didn't update
  });
});

describe("SupplierDetail — manager remove product", () => {
  it("removes row when confirm true and action succeeds", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(removeIngredientSupplier).mockResolvedValue({
      success: true,
      data: undefined,
    });

    renderManager();

    fireEvent.click(screen.getByRole("button", { name: /remove milk/i }));

    expect(confirmSpy).toHaveBeenCalledWith(
      "Remove this product from the supplier?"
    );

    await waitFor(() => {
      expect(removeIngredientSupplier).toHaveBeenCalledWith({ id: "link-milk" });
    });

    await waitFor(() => {
      expect(screen.queryByText("Milk")).toBeNull();
    });

    confirmSpy.mockRestore();
  });

  it("does nothing if confirm is cancelled", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    renderManager();
    fireEvent.click(screen.getByRole("button", { name: /remove milk/i }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(removeIngredientSupplier).not.toHaveBeenCalled();
    expect(screen.getByText("Milk")).toBeDefined();

    confirmSpy.mockRestore();
  });

  it("toasts the purchase-history error and leaves the row", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(removeIngredientSupplier).mockResolvedValue({
      success: false,
      error: "Has purchase history; archive supplier instead",
    });

    renderManager();
    fireEvent.click(screen.getByRole("button", { name: /remove milk/i }));

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith("Has purchase history; archive supplier instead");
    });

    // Row still present
    expect(screen.getByText("Milk")).toBeDefined();

    confirmSpy.mockRestore();
  });
});

describe("SupplierDetail — picker exhausted", () => {
  it("disables the Add product button and shows the hint when every ingredient is linked", () => {
    // Only Milk + Sugar exist as cafe ingredients; both already linked
    render(
      <SupplierDetail
        supplier={baseSupplier}
        purchases={[]}
        allIngredients={[
          { id: "ing-milk", name: "Milk", unit: "L" },
          { id: "ing-sugar", name: "Sugar", unit: "kg" },
        ]}
        mode="manager"
      />
    );

    const addBtn = screen.getByRole("button", { name: /add product/i }) as HTMLButtonElement;
    expect(addBtn.disabled).toBe(true);
    expect(
      screen.getByText(/all cafe ingredients are linked to this supplier/i)
    ).toBeDefined();
  });
});

describe("SupplierDetail — staff readonly mode", () => {
  it("renders products read-only with no edit/remove/add controls", () => {
    render(
      <SupplierDetail
        supplier={baseSupplier}
        purchases={[]}
        allIngredients={allIngredients}
        mode="readonly"
      />
    );

    // Product names visible
    expect(screen.getByText("Milk")).toBeDefined();
    expect(screen.getByText("Sugar")).toBeDefined();
    expect(screen.getByText("RM 3.50/L")).toBeDefined();
    expect(screen.getByText("RM 2.00/kg")).toBeDefined();

    // No manager controls
    expect(screen.queryByRole("button", { name: /edit milk/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /remove milk/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /add product/i })).toBeNull();
    expect(
      screen.queryByText(/all cafe ingredients are linked/i)
    ).toBeNull();
  });

  it("does not show top-level Edit supplier button in readonly mode", () => {
    render(
      <SupplierDetail
        supplier={baseSupplier}
        purchases={[]}
        allIngredients={allIngredients}
        mode="readonly"
      />
    );
    expect(screen.queryByRole("button", { name: /edit supplier/i })).toBeNull();
  });
});

describe("SupplierDetail — products section structure", () => {
  it("shows the Products supplied heading even when empty", () => {
    render(
      <SupplierDetail
        supplier={{ ...baseSupplier, products: [] }}
        purchases={[]}
        allIngredients={allIngredients}
        mode="manager"
      />
    );
    expect(screen.getByText(/products supplied/i)).toBeDefined();
    expect(screen.getByText(/no ingredients linked yet/i)).toBeDefined();
    // Picker has all 3 ingredients available
    fireEvent.click(screen.getByRole("button", { name: /add product/i }));
    const select = screen.getByLabelText("Ingredient") as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent?.trim());
    expect(labels).toEqual(["Choose…", "Flour", "Milk", "Sugar"]);
  });

  it("scopes edit form to the row being edited", () => {
    renderManager();
    fireEvent.click(screen.getByRole("button", { name: /edit sugar/i }));

    // One Price (RM) input should be present (only sugar's row in edit)
    const priceInputs = screen.getAllByLabelText("Price (RM)");
    expect(priceInputs).toHaveLength(1);
    expect((priceInputs[0] as HTMLInputElement).value).toBe("2.00");
    // Milk row remains in display mode, with its old price still visible
    expect(screen.getByText("RM 3.50/L")).toBeDefined();
  });
});
