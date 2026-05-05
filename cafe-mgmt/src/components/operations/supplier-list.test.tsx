import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

// Mock setup actions (ingredient-supplier link CRUD)
vi.mock("@/actions/setup.actions", () => ({
  addIngredientSupplier: vi.fn(),
  updateIngredientSupplier: vi.fn(),
  removeIngredientSupplier: vi.fn(),
}));

// Mock supplier actions (unused here, but the component imports them)
vi.mock("@/actions/supplier.actions", () => ({
  addSupplier: vi.fn(),
  updateSupplier: vi.fn(),
  deleteSupplier: vi.fn(),
  logCallOutcome: vi.fn(),
}));

// Mock toast
const toastSpy = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: toastSpy }),
}));

import {
  addIngredientSupplier,
  updateIngredientSupplier,
  removeIngredientSupplier,
} from "@/actions/setup.actions";
import { SupplierList } from "./supplier-list";

const supplierA = {
  id: "sup-a",
  name: "Acme Foods",
  phone: "555-1234",
  notes: null,
  lastOrderDate: null,
  reminderDays: 7,
  ingredients: [
    { id: "ing-milk", name: "Milk", unit: "L" },
  ],
  ingredientChoices: [
    {
      id: "link-milk",
      ingredientId: "ing-milk",
      ingredientName: "Milk",
      unit: "L",
      priceInCents: 350,
      linkedToSupplier: true,
    },
  ],
};

const supplierB = {
  id: "sup-b",
  name: "Beans Co",
  phone: null,
  notes: null,
  lastOrderDate: null,
  reminderDays: 7,
  ingredients: [],
  ingredientChoices: [],
};

const allIngredients = [
  { id: "ing-coffee", name: "Coffee", unit: "kg" },
  { id: "ing-milk", name: "Milk", unit: "L" },
  { id: "ing-sugar", name: "Sugar", unit: "kg" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

function renderManager() {
  return render(
    <SupplierList
      initialSuppliers={[supplierA, supplierB]}
      allIngredients={allIngredients}
      isManager
    />
  );
}

function findCard(supplierName: string): HTMLElement {
  const link = screen.getByRole("link", { name: supplierName });
  // Walk up to the nearest card div (the rounded-lg wrapper).
  let el: HTMLElement | null = link;
  while (el && !el.className.includes("rounded-lg")) {
    el = el.parentElement;
  }
  if (!el) throw new Error(`Card for ${supplierName} not found`);
  return el;
}

describe("SupplierList — manager add ingredient", () => {
  it("calls addIngredientSupplier with correct payload and shows new chip", async () => {
    vi.mocked(addIngredientSupplier).mockResolvedValue({
      success: true,
      data: { id: "link-coffee" },
    });

    renderManager();

    // Beans Co has no ingredients yet — open its picker
    const beansCard = findCard("Beans Co");
    fireEvent.click(within(beansCard).getByRole("button", { name: /add ingredient/i }));

    // Pick Coffee + RM 12.50 + kg
    const select = within(beansCard).getByLabelText("Ingredient") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "ing-coffee" } });

    const priceInput = within(beansCard).getByLabelText("Price (RM)") as HTMLInputElement;
    fireEvent.change(priceInput, { target: { value: "12.50" } });

    const unitInput = within(beansCard).getByLabelText("Unit") as HTMLInputElement;
    fireEvent.change(unitInput, { target: { value: "kg" } });

    fireEvent.click(within(beansCard).getByRole("button", { name: /save new ingredient/i }));

    await waitFor(() => {
      expect(addIngredientSupplier).toHaveBeenCalledWith({
        ingredientId: "ing-coffee",
        supplierId: "sup-b",
        priceInCents: 1250,
        unit: "kg",
      });
    });

    // New chip appears (find the chip with both name + price/unit text)
    await waitFor(() => {
      const chip = within(findCard("Beans Co")).getByRole("button", { name: /edit coffee/i });
      expect(chip).toBeDefined();
    });
    expect(within(findCard("Beans Co")).getByText("RM 12.50/kg")).toBeDefined();

    // Picker form closed
    expect(within(findCard("Beans Co")).queryByLabelText("Ingredient")).toBeNull();
  });

  it("rolls back optimistic insert and toasts on duplicate-link error", async () => {
    vi.mocked(addIngredientSupplier).mockResolvedValue({
      success: false,
      error: "Supplier already added",
    });

    renderManager();

    const beansCard = findCard("Beans Co");
    fireEvent.click(within(beansCard).getByRole("button", { name: /add ingredient/i }));

    fireEvent.change(within(beansCard).getByLabelText("Ingredient"), {
      target: { value: "ing-coffee" },
    });
    fireEvent.change(within(beansCard).getByLabelText("Price (RM)"), {
      target: { value: "12.50" },
    });
    fireEvent.change(within(beansCard).getByLabelText("Unit"), {
      target: { value: "kg" },
    });

    fireEvent.click(within(beansCard).getByRole("button", { name: /save new ingredient/i }));

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith("Supplier already added");
    });

    // Chip should NOT appear after rollback
    expect(
      within(findCard("Beans Co")).queryByRole("button", { name: /edit coffee/i })
    ).toBeNull();
  });
});

describe("SupplierList — manager edit ingredient", () => {
  it("calls updateIngredientSupplier and updates chip in place", async () => {
    vi.mocked(updateIngredientSupplier).mockResolvedValue({
      success: true,
      data: undefined,
    });

    renderManager();

    const acmeCard = findCard("Acme Foods");
    fireEvent.click(within(acmeCard).getByRole("button", { name: /edit milk/i }));

    const priceInput = within(acmeCard).getByLabelText("Price for Milk") as HTMLInputElement;
    expect(priceInput.value).toBe("3.50");

    fireEvent.change(priceInput, { target: { value: "4.20" } });

    fireEvent.click(within(acmeCard).getByRole("button", { name: /save milk/i }));

    await waitFor(() => {
      expect(updateIngredientSupplier).toHaveBeenCalledWith({
        id: "link-milk",
        priceInCents: 420,
        unit: "L",
      });
    });

    await waitFor(() => {
      expect(within(findCard("Acme Foods")).getByText("RM 4.20/L")).toBeDefined();
    });

    // Edit form closed
    expect(within(findCard("Acme Foods")).queryByLabelText("Price for Milk")).toBeNull();
  });
});

describe("SupplierList — manager remove ingredient", () => {
  it("opens confirmation then removes chip on confirm", async () => {
    vi.mocked(removeIngredientSupplier).mockResolvedValue({
      success: true,
      data: undefined,
    });

    renderManager();

    const acmeCard = findCard("Acme Foods");
    fireEvent.click(within(acmeCard).getByRole("button", { name: /remove milk/i }));

    // Confirmation dialog appears with the supplier+ingredient names
    await waitFor(() => {
      expect(screen.getByText(/remove milk from acme foods\?/i)).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /^remove$/i }));

    await waitFor(() => {
      expect(removeIngredientSupplier).toHaveBeenCalledWith({ id: "link-milk" });
    });

    await waitFor(() => {
      expect(
        within(findCard("Acme Foods")).queryByRole("button", { name: /edit milk/i })
      ).toBeNull();
    });
  });

  it("does nothing when user cancels confirmation", async () => {
    renderManager();

    const acmeCard = findCard("Acme Foods");
    fireEvent.click(within(acmeCard).getByRole("button", { name: /remove milk/i }));

    await waitFor(() => {
      expect(screen.getByText(/remove milk from acme foods\?/i)).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(removeIngredientSupplier).not.toHaveBeenCalled();
    // Chip still present
    expect(
      within(findCard("Acme Foods")).getByRole("button", { name: /edit milk/i })
    ).toBeDefined();
  });
});

describe("SupplierList — pending gate / role flip / precise pricing", () => {
  it("rapid double-click on save calls addIngredientSupplier exactly once", async () => {
    // Deferred promise so the action stays pending while we click again.
    let resolveAdd: (v: { success: true; data: { id: string } }) => void = () =>
      undefined;
    const pending = new Promise<{ success: true; data: { id: string } }>(
      (resolve) => {
        resolveAdd = resolve;
      }
    );
    vi.mocked(addIngredientSupplier).mockReturnValue(
      pending as unknown as ReturnType<typeof addIngredientSupplier>
    );

    renderManager();

    const beansCard = findCard("Beans Co");
    fireEvent.click(within(beansCard).getByRole("button", { name: /add ingredient/i }));

    fireEvent.change(within(beansCard).getByLabelText("Ingredient"), {
      target: { value: "ing-coffee" },
    });
    fireEvent.change(within(beansCard).getByLabelText("Price (RM)"), {
      target: { value: "12.50" },
    });
    fireEvent.change(within(beansCard).getByLabelText("Unit"), {
      target: { value: "kg" },
    });

    const saveBtn = within(beansCard).getByRole("button", {
      name: /save new ingredient/i,
    });

    // Two rapid clicks while the action is in flight.
    fireEvent.click(saveBtn);
    fireEvent.click(saveBtn);

    // Allow any microtasks to flush.
    await Promise.resolve();

    expect(addIngredientSupplier).toHaveBeenCalledTimes(1);

    // Resolve to clean up the transition.
    resolveAdd({ success: true, data: { id: "link-coffee" } });
    await waitFor(() => {
      expect(within(findCard("Beans Co")).queryByLabelText("Ingredient")).toBeNull();
    });
  });

  it("price '12.30' persists as exactly 1230 cents (no float noise)", async () => {
    vi.mocked(addIngredientSupplier).mockResolvedValue({
      success: true,
      data: { id: "link-coffee" },
    });

    renderManager();

    const beansCard = findCard("Beans Co");
    fireEvent.click(within(beansCard).getByRole("button", { name: /add ingredient/i }));

    fireEvent.change(within(beansCard).getByLabelText("Ingredient"), {
      target: { value: "ing-coffee" },
    });
    fireEvent.change(within(beansCard).getByLabelText("Price (RM)"), {
      target: { value: "12.30" },
    });
    fireEvent.change(within(beansCard).getByLabelText("Unit"), {
      target: { value: "kg" },
    });

    fireEvent.click(within(beansCard).getByRole("button", { name: /save new ingredient/i }));

    await waitFor(() => {
      expect(addIngredientSupplier).toHaveBeenCalledWith({
        ingredientId: "ing-coffee",
        supplierId: "sup-b",
        priceInCents: 1230,
        unit: "kg",
      });
    });

    // The actual numeric value must be exactly 1230, not 1229.9999...
    const call = vi.mocked(addIngredientSupplier).mock.calls[0]?.[0];
    expect(call?.priceInCents).toBe(1230);
    expect(Number.isInteger(call?.priceInCents)).toBe(true);
  });

  it("flipping isManager to false closes the open picker and clears state", () => {
    const { rerender } = render(
      <SupplierList
        initialSuppliers={[supplierA, supplierB]}
        allIngredients={allIngredients}
        isManager
      />
    );

    // Open the picker on Beans Co.
    const beansCard = findCard("Beans Co");
    fireEvent.click(within(beansCard).getByRole("button", { name: /add ingredient/i }));
    expect(within(findCard("Beans Co")).getByLabelText("Ingredient")).toBeDefined();

    // Flip role to staff.
    rerender(
      <SupplierList
        initialSuppliers={[supplierA, supplierB]}
        allIngredients={allIngredients}
        isManager={false}
      />
    );

    // Picker form is gone; no add-ingredient or edit/remove controls remain.
    expect(screen.queryByLabelText("Ingredient")).toBeNull();
    expect(screen.queryByRole("button", { name: /add ingredient/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /edit milk/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /remove milk/i })).toBeNull();
  });
});

describe("SupplierList — staff read-only", () => {
  it("renders chips read-only with no add button or edit/remove controls", () => {
    render(
      <SupplierList
        initialSuppliers={[supplierA, supplierB]}
        allIngredients={allIngredients}
        isManager={false}
      />
    );

    // Ingredient text visible
    expect(screen.getByText("Milk")).toBeDefined();

    // No Add ingredient button
    expect(
      screen.queryByRole("button", { name: /add ingredient/i })
    ).toBeNull();

    // Chips are spans, not buttons
    expect(screen.queryByRole("button", { name: /edit milk/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /remove milk/i })).toBeNull();

    // No Add Supplier control either
    expect(screen.queryByRole("button", { name: /add supplier/i })).toBeNull();
  });
});

describe("SupplierList — add validation", () => {
  it("disables save when fields are empty and enables once all are filled", () => {
    renderManager();

    const beansCard = findCard("Beans Co");
    fireEvent.click(within(beansCard).getByRole("button", { name: /add ingredient/i }));

    const saveBtn = within(beansCard).getByRole("button", {
      name: /save new ingredient/i,
    }) as HTMLButtonElement;

    // All empty → disabled
    expect(saveBtn.disabled).toBe(true);

    // Fill ingredient only → still disabled
    fireEvent.change(within(beansCard).getByLabelText("Ingredient"), {
      target: { value: "ing-coffee" },
    });
    expect(saveBtn.disabled).toBe(true);

    // Add price only → still disabled (no unit)
    fireEvent.change(within(beansCard).getByLabelText("Price (RM)"), {
      target: { value: "5.00" },
    });
    expect(saveBtn.disabled).toBe(true);

    // Add unit → now enabled
    fireEvent.change(within(beansCard).getByLabelText("Unit"), {
      target: { value: "kg" },
    });
    expect(saveBtn.disabled).toBe(false);

    // Zero price → disabled again
    fireEvent.change(within(beansCard).getByLabelText("Price (RM)"), {
      target: { value: "0" },
    });
    expect(saveBtn.disabled).toBe(true);
  });

  it("filters the picker to exclude already-linked ingredients", () => {
    renderManager();

    // Acme already has Milk linked
    const acmeCard = findCard("Acme Foods");
    fireEvent.click(within(acmeCard).getByRole("button", { name: /add ingredient/i }));

    const select = within(acmeCard).getByLabelText("Ingredient") as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent?.trim());
    expect(optionLabels).toEqual(["Choose…", "Coffee", "Sugar"]);
  });
});
