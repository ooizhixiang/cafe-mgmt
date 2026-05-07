import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock the server actions
vi.mock("@/actions/inventory.actions", () => ({
  updateIngredientConfig: vi.fn(),
  togglePin: vi.fn(),
  setManualCostOverride: vi.fn(),
}));

vi.mock("@/actions/setup.actions", () => ({
  addIngredient: vi.fn(),
  updateIngredient: vi.fn(),
  deleteIngredient: vi.fn(),
}));

// Mock the toast helper
const toastSpy = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: toastSpy }),
}));

// Mock the suppliers panel — it imports actions we don't care about exercising here
vi.mock("@/components/ingredients/ingredient-suppliers-panel", () => ({
  IngredientSuppliersPanel: ({
    ingredientId,
  }: {
    ingredientId: string;
  }) => <div data-testid="suppliers-panel">{ingredientId}</div>,
}));

import {
  updateIngredientConfig,
  togglePin,
  setManualCostOverride,
} from "@/actions/inventory.actions";
import {
  addIngredient,
  updateIngredient,
  deleteIngredient,
} from "@/actions/setup.actions";
import { IngredientSpreadsheet } from "./ingredient-spreadsheet";

const baseIngredient = {
  id: "ing-1",
  name: "Milk",
  unit: "L",
  costPerUnitInCents: 150,
  derivedCostPerUnitInCents: 150,
  snapIncrement: 5,
  containerProfile: "carton (1L)",
  category: "Dairy",
  lowStockThreshold: 10,
  unitsPerContainer: 1,
  isPinned: false,
  manualCostOverride: true,
  ingredientSuppliers: [],
  ingredientPurchases: [],
};

const otherIngredient = {
  id: "ing-2",
  name: "Sugar",
  unit: "kg",
  costPerUnitInCents: 200,
  derivedCostPerUnitInCents: 200,
  snapIncrement: null,
  containerProfile: null,
  category: null,
  lowStockThreshold: null,
  unitsPerContainer: null,
  isPinned: false,
  manualCostOverride: true,
  ingredientSuppliers: [],
  ingredientPurchases: [],
};

const suppliers = [{ id: "sup1", name: "Acme" }];

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom shares one localStorage instance across tests; clear it so the
  // advanced-columns toggle preference doesn't leak between cases.
  try {
    localStorage.clear();
  } catch {}
});

function renderSpreadsheet(
  ingredients = [baseIngredient, otherIngredient],
  distinctCategories: string[] = ["Dairy"]
) {
  return render(
    <IngredientSpreadsheet
      initialIngredients={ingredients}
      suppliers={suppliers}
      distinctCategories={distinctCategories}
    />
  );
}

describe("IngredientSpreadsheet — edit on blur", () => {
  it("calls setManualCostOverride (auto-lock) when cost cell is edited and blurred", async () => {
    vi.mocked(setManualCostOverride).mockResolvedValue({
      success: true,
      data: undefined,
    });

    renderSpreadsheet();

    const costInput = screen.getByLabelText("cost Milk") as HTMLInputElement;
    expect(costInput.value).toBe("1.50");

    fireEvent.change(costInput, { target: { value: "2.00" } });
    fireEvent.blur(costInput);

    await waitFor(() => {
      expect(setManualCostOverride).toHaveBeenCalledWith("ing-1", true, 200);
    });
    // Cost saves go through setManualCostOverride, not updateIngredientConfig
    expect(updateIngredientConfig).not.toHaveBeenCalled();
    // Patch 10: silent on success — no "Saved" toast for cell saves
    expect(toastSpy).not.toHaveBeenCalledWith("Saved");
  });

  it("persists sub-cent fractional cost (0.005 → 0.5 cents) and renders cell as $0.0050", async () => {
    vi.mocked(setManualCostOverride).mockResolvedValue({
      success: true,
      data: undefined,
    });

    renderSpreadsheet();

    const costInput = screen.getByLabelText("cost Milk") as HTMLInputElement;
    expect(costInput.value).toBe("1.50");

    fireEvent.change(costInput, { target: { value: "0.005" } });
    fireEvent.blur(costInput);

    await waitFor(() => {
      expect(setManualCostOverride).toHaveBeenCalledWith("ing-1", true, 0.5);
    });

    // Sub-cent value renders with 4-decimal precision so the user's original
    // "0.005" entry round-trips visibly (formerly the cell showed "$0.00").
    await waitFor(() => {
      const refreshed = screen.getByLabelText("cost Milk") as HTMLInputElement;
      expect(refreshed.value).toBe("0.0050");
    });
  });

  it("saves on Enter key (blurs the input)", async () => {
    vi.mocked(updateIngredientConfig).mockResolvedValue({
      success: true,
      data: undefined,
    });

    renderSpreadsheet();

    const thresholdInput = screen.getByLabelText(
      "threshold Milk"
    ) as HTMLInputElement;

    fireEvent.change(thresholdInput, { target: { value: "20" } });
    fireEvent.keyDown(thresholdInput, { key: "Enter" });
    fireEvent.blur(thresholdInput);

    await waitFor(() => {
      expect(updateIngredientConfig).toHaveBeenCalledWith({
        id: "ing-1",
        lowStockThreshold: 20,
      });
    });
  });
});

describe("IngredientSpreadsheet — Esc reverts edit", () => {
  it("Esc restores the original value and does not call the action", async () => {
    renderSpreadsheet();

    const costInput = screen.getByLabelText("cost Milk") as HTMLInputElement;
    expect(costInput.value).toBe("1.50");

    fireEvent.change(costInput, { target: { value: "9.99" } });
    fireEvent.keyDown(costInput, { key: "Escape" });
    fireEvent.blur(costInput);

    expect(costInput.value).toBe("1.50");
    expect(updateIngredientConfig).not.toHaveBeenCalled();
  });
});

describe("IngredientSpreadsheet — invalid numeric", () => {
  it("rejects negative cost, reverts, no server call", async () => {
    renderSpreadsheet();

    // type=number inputs strip non-numeric, so simulate via change with a negative value
    const costInput = screen.getByLabelText("cost Milk") as HTMLInputElement;

    fireEvent.change(costInput, { target: { value: "-5" } });
    fireEvent.blur(costInput);

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith("Invalid number");
    });
    expect(updateIngredientConfig).not.toHaveBeenCalled();
    expect(setManualCostOverride).not.toHaveBeenCalled();
    // value reverted
    expect(costInput.value).toBe("1.50");
  });

  it("rejects non-integer input on snap, reverts, toasts 'Whole number required'", async () => {
    renderSpreadsheet();
    // Snap is an advanced column hidden by default; reveal it first.
    fireEvent.click(screen.getByRole("button", { name: /Show advanced columns/i }));

    const snapInput = screen.getByLabelText("snap Milk") as HTMLInputElement;
    expect(snapInput.value).toBe("5");

    fireEvent.change(snapInput, { target: { value: "5.7" } });
    fireEvent.blur(snapInput);

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith("Whole number required");
    });
    expect(updateIngredientConfig).not.toHaveBeenCalled();
    expect(snapInput.value).toBe("5");
  });

  it("rejects out-of-range cost (1e10) and reverts", async () => {
    renderSpreadsheet();

    const costInput = screen.getByLabelText("cost Milk") as HTMLInputElement;
    expect(costInput.value).toBe("1.50");

    fireEvent.change(costInput, { target: { value: "1e10" } });
    fireEvent.blur(costInput);

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith("Cost out of range");
    });
    expect(updateIngredientConfig).not.toHaveBeenCalled();
    expect(setManualCostOverride).not.toHaveBeenCalled();
    expect(costInput.value).toBe("1.50");
  });
});

describe("IngredientSpreadsheet — toggle pin", () => {
  it("calls togglePin and optimistically updates the row", async () => {
    vi.mocked(togglePin).mockResolvedValue({
      success: true,
      data: undefined,
    });

    renderSpreadsheet();

    const pinBtns = screen.getAllByRole("button", { name: /^pin$/i });
    fireEvent.click(pinBtns[0]);

    await waitFor(() => {
      expect(togglePin).toHaveBeenCalledWith("ing-1");
    });
  });

  it("reverts pin on failure", async () => {
    vi.mocked(togglePin).mockResolvedValue({
      success: false,
      error: "boom",
    });

    renderSpreadsheet();

    const pinBtns = screen.getAllByRole("button", { name: /^pin$/i });
    fireEvent.click(pinBtns[0]);

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith("boom");
    });
  });
});

describe("IngredientSpreadsheet — delete", () => {
  it("opens confirmation dialog and deletes on confirm", async () => {
    vi.mocked(deleteIngredient).mockResolvedValue({
      success: true,
      data: undefined,
    });

    renderSpreadsheet();

    fireEvent.click(screen.getByRole("button", { name: /delete milk/i }));

    // Confirmation dialog appears
    expect(
      screen.getByText(/Remove "Milk" from your ingredient list/i)
    ).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /^remove$/i }));

    await waitFor(() => {
      expect(deleteIngredient).toHaveBeenCalledWith("ing-1");
    });

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith("Ingredient removed");
    });
  });

  it("does nothing if delete cancelled", () => {
    renderSpreadsheet();

    fireEvent.click(screen.getByRole("button", { name: /delete milk/i }));
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(deleteIngredient).not.toHaveBeenCalled();
  });
});

describe("IngredientSpreadsheet — add row", () => {
  it("adds a new ingredient via the sticky add row and resets the inputs", async () => {
    vi.mocked(addIngredient).mockResolvedValue({
      success: true,
      data: { id: "ing-new" },
    });

    renderSpreadsheet([]);

    const nameInput = screen.getByLabelText(
      "New ingredient name"
    ) as HTMLInputElement;
    const unitInput = screen.getByLabelText(
      "New ingredient unit"
    ) as HTMLInputElement;
    const categorySelect = screen.getByLabelText(
      "New ingredient category"
    ) as HTMLSelectElement;
    const addBtn = screen.getByRole("button", {
      name: /add ingredient/i,
    }) as HTMLButtonElement;

    expect(addBtn.disabled).toBe(true);

    fireEvent.change(nameInput, { target: { value: "Cocoa" } });
    fireEvent.change(unitInput, { target: { value: "g" } });
    fireEvent.change(categorySelect, { target: { value: "Unassigned" } });

    expect(addBtn.disabled).toBe(false);
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(addIngredient).toHaveBeenCalledWith("Cocoa", "g", "Unassigned");
    });

    // Inputs reset — except the unit, which is intentionally carried forward
    // (UX: managers usually add multiple ingredients in the same unit, and
    // a controlled <select> with value="" would silently snap to first option
    // while keeping state empty — a known React quirk).
    await waitFor(() => {
      expect(nameInput.value).toBe("");
      expect(unitInput.value).toBe("g");
      expect(categorySelect.value).toBe("");
    });
  });

  it("toasts 'Name and unit required' when Enter is pressed with an empty unit", async () => {
    renderSpreadsheet([]);

    const nameInput = screen.getByLabelText(
      "New ingredient name"
    ) as HTMLInputElement;

    fireEvent.change(nameInput, { target: { value: "Cocoa" } });
    // Unit is still empty
    fireEvent.keyDown(nameInput, { key: "Enter" });

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith("Name and unit required");
    });
    expect(addIngredient).not.toHaveBeenCalled();
  });

  it("toasts on add failure and keeps inputs", async () => {
    vi.mocked(addIngredient).mockResolvedValue({
      success: false,
      error: "duplicate",
    });

    renderSpreadsheet([]);

    fireEvent.change(screen.getByLabelText("New ingredient name"), {
      target: { value: "Cocoa" },
    });
    fireEvent.change(screen.getByLabelText("New ingredient unit"), {
      target: { value: "g" },
    });
    fireEvent.change(screen.getByLabelText("New ingredient category"), {
      target: { value: "Unassigned" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add ingredient/i }));

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith("duplicate");
    });
  });
});

describe("IngredientSpreadsheet — stale row error", () => {
  it("toasts the server error and reverts when ingredient is deleted elsewhere", async () => {
    // Cost cell saves go through setManualCostOverride after Spec B1
    vi.mocked(setManualCostOverride).mockResolvedValue({
      success: false,
      error: "Ingredient not found",
    });

    renderSpreadsheet();

    const costInput = screen.getByLabelText("cost Milk") as HTMLInputElement;
    fireEvent.change(costInput, { target: { value: "3.00" } });
    fireEvent.blur(costInput);

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith("Ingredient not found");
    });
    // value rolled back — re-query in case the input was remounted
    await waitFor(() => {
      const after = screen.getByLabelText("cost Milk") as HTMLInputElement;
      expect(after.value).toBe("1.50");
    });
  });
});

describe("IngredientSpreadsheet — name rename", () => {
  it("calls updateIngredient when the name cell changes", async () => {
    vi.mocked(updateIngredient).mockResolvedValue({
      success: true,
      data: undefined,
    });

    renderSpreadsheet();

    const nameInput = screen.getByLabelText("name Milk") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Whole Milk" } });
    fireEvent.blur(nameInput);

    await waitFor(() => {
      expect(updateIngredient).toHaveBeenCalledWith("ing-1", "Whole Milk", "L");
    });
  });
});

// ─── Search, filter, and required-category tests ───────────────

const milk = {
  id: "i-milk",
  name: "Milk",
  unit: "L",
  costPerUnitInCents: null,
  derivedCostPerUnitInCents: null,
  snapIncrement: null,
  containerProfile: null,
  category: "Dairy",
  lowStockThreshold: null,
  unitsPerContainer: null,
  isPinned: false,
  manualCostOverride: true,
  ingredientSuppliers: [],
  ingredientPurchases: [],
};
const espresso = {
  id: "i-espresso",
  name: "Espresso Beans",
  unit: "kg",
  costPerUnitInCents: null,
  derivedCostPerUnitInCents: null,
  snapIncrement: null,
  containerProfile: null,
  category: "Coffee",
  lowStockThreshold: null,
  unitsPerContainer: null,
  isPinned: false,
  manualCostOverride: true,
  ingredientSuppliers: [],
  ingredientPurchases: [],
};
const sugar = {
  id: "i-sugar",
  name: "Sugar",
  unit: "kg",
  costPerUnitInCents: null,
  derivedCostPerUnitInCents: null,
  snapIncrement: null,
  containerProfile: null,
  category: "Pantry",
  lowStockThreshold: null,
  unitsPerContainer: null,
  isPinned: false,
  manualCostOverride: true,
  ingredientSuppliers: [],
  ingredientPurchases: [],
};

describe("IngredientSpreadsheet — search filters by name", () => {
  it("hides non-matching rows when typing in the search box", () => {
    renderSpreadsheet(
      [milk, espresso, sugar],
      ["Coffee", "Dairy", "Pantry"]
    );

    // All visible initially
    expect(screen.getByLabelText("name Milk")).toBeDefined();
    expect(screen.getByLabelText("name Espresso Beans")).toBeDefined();
    expect(screen.getByLabelText("name Sugar")).toBeDefined();

    fireEvent.change(screen.getByLabelText("Search ingredients"), {
      target: { value: "es" },
    });

    // "Espresso Beans" matches "es" (case-insensitive substring)
    expect(screen.getByLabelText("name Espresso Beans")).toBeDefined();
    // Milk and Sugar should be hidden
    expect(screen.queryByLabelText("name Milk")).toBeNull();
    expect(screen.queryByLabelText("name Sugar")).toBeNull();
  });
});

describe("IngredientSpreadsheet — category filter", () => {
  it("shows only checked-category rows", () => {
    renderSpreadsheet(
      [milk, espresso, sugar],
      ["Coffee", "Dairy", "Pantry"]
    );

    // Open filter popover
    fireEvent.click(screen.getByRole("button", { name: /^filter$/i }));

    fireEvent.click(screen.getByLabelText("Filter by Coffee"));
    fireEvent.click(screen.getByLabelText("Filter by Dairy"));

    expect(screen.getByLabelText("name Milk")).toBeDefined();
    expect(screen.getByLabelText("name Espresso Beans")).toBeDefined();
    expect(screen.queryByLabelText("name Sugar")).toBeNull();
  });
});

describe("IngredientSpreadsheet — search ∩ filter combined", () => {
  it("shows the intersection of both criteria", () => {
    renderSpreadsheet(
      [milk, espresso, sugar],
      ["Coffee", "Dairy", "Pantry"]
    );

    fireEvent.change(screen.getByLabelText("Search ingredients"), {
      target: { value: "milk" },
    });

    fireEvent.click(screen.getByRole("button", { name: /^filter \(0\)$|^filter$/i }));
    fireEvent.click(screen.getByLabelText("Filter by Dairy"));

    // Only Milk matches both "milk" and Dairy
    expect(screen.getByLabelText("name Milk")).toBeDefined();
    expect(screen.queryByLabelText("name Espresso Beans")).toBeNull();
    expect(screen.queryByLabelText("name Sugar")).toBeNull();
  });
});

describe("IngredientSpreadsheet — empty filter result", () => {
  it("renders 'No ingredients match' with a Clear button that resets state", () => {
    renderSpreadsheet([milk, espresso], ["Coffee", "Dairy"]);

    fireEvent.change(screen.getByLabelText("Search ingredients"), {
      target: { value: "zzz-no-match" },
    });

    expect(screen.getByText(/No ingredients match/i)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /^clear$/i }));

    // After Clear, all rows are visible again
    expect(screen.getByLabelText("name Milk")).toBeDefined();
    expect(screen.getByLabelText("name Espresso Beans")).toBeDefined();
    expect(
      (screen.getByLabelText("Search ingredients") as HTMLInputElement).value
    ).toBe("");
  });
});

describe("IngredientSpreadsheet — add-row category required", () => {
  it("disables ✓ when name+unit are filled but category is not selected", () => {
    renderSpreadsheet([], []);

    fireEvent.change(screen.getByLabelText("New ingredient name"), {
      target: { value: "Cocoa" },
    });
    fireEvent.change(screen.getByLabelText("New ingredient unit"), {
      target: { value: "g" },
    });

    const addBtn = screen.getByRole("button", {
      name: /add ingredient/i,
    }) as HTMLButtonElement;
    expect(addBtn.disabled).toBe(true);

    // Pick a category — now enabled
    fireEvent.change(screen.getByLabelText("New ingredient category"), {
      target: { value: "Unassigned" },
    });
    expect(addBtn.disabled).toBe(false);
  });

  it("calls addIngredient with (name, unit, category) on submit", async () => {
    vi.mocked(addIngredient).mockResolvedValue({
      success: true,
      data: { id: "i-new" },
    });

    renderSpreadsheet([], ["Coffee"]);

    fireEvent.change(screen.getByLabelText("New ingredient name"), {
      target: { value: "Latte Beans" },
    });
    fireEvent.change(screen.getByLabelText("New ingredient unit"), {
      target: { value: "kg" },
    });
    fireEvent.change(screen.getByLabelText("New ingredient category"), {
      target: { value: "Coffee" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add ingredient/i }));

    await waitFor(() => {
      expect(addIngredient).toHaveBeenCalledWith(
        "Latte Beans",
        "kg",
        "Coffee"
      );
    });
  });
});

describe("IngredientSpreadsheet — category dropdown options", () => {
  it("always includes 'Unassigned' even when no current ingredient uses it", () => {
    renderSpreadsheet([], []);

    const select = screen.getByLabelText(
      "New ingredient category"
    ) as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toContain("Unassigned");
    // Placeholder is the empty value
    expect(optionValues[0]).toBe("");
  });
});

describe("IngredientSpreadsheet — popover click-outside", () => {
  it("closes the filter popover on pointerdown outside", () => {
    renderSpreadsheet([milk, espresso], ["Coffee", "Dairy"]);

    // Open the popover
    fireEvent.click(screen.getByRole("button", { name: /^filter$/i }));
    expect(screen.getByRole("dialog", { name: /filter by category/i })).toBeDefined();

    // Pointerdown on document body (outside popover and trigger)
    fireEvent.pointerDown(document.body);

    expect(
      screen.queryByRole("dialog", { name: /filter by category/i })
    ).toBeNull();
  });
});

describe("IngredientSpreadsheet — search clear button", () => {
  it("clears the search input and restores all rows", () => {
    renderSpreadsheet([milk, espresso, sugar], ["Coffee", "Dairy", "Pantry"]);

    const searchInput = screen.getByLabelText(
      "Search ingredients"
    ) as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: "milk" } });

    // Only Milk visible
    expect(screen.getByLabelText("name Milk")).toBeDefined();
    expect(screen.queryByLabelText("name Espresso Beans")).toBeNull();

    // Click the ✕ button
    fireEvent.click(screen.getByRole("button", { name: /clear search/i }));

    expect(searchInput.value).toBe("");
    // All rows back
    expect(screen.getByLabelText("name Milk")).toBeDefined();
    expect(screen.getByLabelText("name Espresso Beans")).toBeDefined();
    expect(screen.getByLabelText("name Sugar")).toBeDefined();
  });
});

describe("IngredientSpreadsheet — locally-edited category appears in filter", () => {
  it("surfaces a category typed into a row's category cell", async () => {
    vi.mocked(updateIngredientConfig).mockResolvedValue({
      success: true,
      data: undefined,
    });

    // Start with one row in "Dairy"
    renderSpreadsheet([milk], ["Dairy"]);

    // Edit the category cell on the Milk row to "Coffee"
    const categoryInput = screen.getByLabelText(
      "category Milk"
    ) as HTMLInputElement;
    fireEvent.change(categoryInput, { target: { value: "Coffee" } });
    fireEvent.blur(categoryInput);

    await waitFor(() => {
      expect(updateIngredientConfig).toHaveBeenCalledWith({
        id: "i-milk",
        category: "Coffee",
      });
    });

    // Open the filter popover — "Coffee" must now be an option
    fireEvent.click(
      screen.getByRole("button", { name: /^filter$/i })
    );
    await waitFor(() => {
      expect(screen.getByLabelText("Filter by Coffee")).toBeDefined();
    });
  });
});

describe("IngredientSpreadsheet — category cleared to empty saves null", () => {
  it("calls updateIngredientConfig with category: null when cleared", async () => {
    vi.mocked(updateIngredientConfig).mockResolvedValue({
      success: true,
      data: undefined,
    });

    renderSpreadsheet([milk], ["Dairy"]);

    const categoryInput = screen.getByLabelText(
      "category Milk"
    ) as HTMLInputElement;
    expect(categoryInput.value).toBe("Dairy");

    fireEvent.change(categoryInput, { target: { value: "" } });
    fireEvent.blur(categoryInput);

    await waitFor(() => {
      expect(updateIngredientConfig).toHaveBeenCalledWith({
        id: "i-milk",
        category: null,
      });
    });
  });
});

describe("IngredientSpreadsheet — Unassigned filter shows null-category rows", () => {
  it("renders an ingredient with category: null when 'Unassigned' is checked", () => {
    const ghost = {
      id: "i-ghost",
      name: "Mystery",
      unit: "ea",
      costPerUnitInCents: null,
      derivedCostPerUnitInCents: null,
      snapIncrement: null,
      containerProfile: null,
      category: null,
      lowStockThreshold: null,
      unitsPerContainer: null,
      isPinned: false,
      manualCostOverride: true,
      ingredientSuppliers: [],
      ingredientPurchases: [],
    };
    renderSpreadsheet([ghost], []);

    fireEvent.click(screen.getByRole("button", { name: /^filter$/i }));
    fireEvent.click(screen.getByLabelText("Filter by Unassigned"));

    expect(screen.getByLabelText("name Mystery")).toBeDefined();
  });
});

// ─── Spec B1: 🔒 / 🔓 cost-override toggle ────────────────

describe("IngredientSpreadsheet — manual cost override toggle", () => {
  it("renders 🔒 (Lock) when manualCostOverride is true", () => {
    renderSpreadsheet([{ ...baseIngredient, manualCostOverride: true }]);
    const lockBtn = screen.getByRole("button", {
      name: /Cost is locked.*Milk/i,
    });
    expect(lockBtn).toBeDefined();
    expect(lockBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("renders 🔓 (Unlock) when manualCostOverride is false", () => {
    renderSpreadsheet([{ ...baseIngredient, manualCostOverride: false }]);
    const unlockBtn = screen.getByRole("button", {
      name: /Cost is unlocked.*Milk/i,
    });
    expect(unlockBtn).toBeDefined();
    expect(unlockBtn.getAttribute("aria-pressed")).toBe("false");
  });

  it("clicking the icon calls setManualCostOverride with the flipped flag", async () => {
    vi.mocked(setManualCostOverride).mockResolvedValue({
      success: true,
      data: undefined,
    });

    renderSpreadsheet([{ ...baseIngredient, manualCostOverride: true }]);

    const lockBtn = screen.getByRole("button", {
      name: /Cost is locked.*Milk/i,
    });
    fireEvent.click(lockBtn);

    await waitFor(() => {
      expect(setManualCostOverride).toHaveBeenCalledWith("ing-1", false);
    });
  });

  it("clicking 🔓 (unlocked) flips back to 🔒 via setManualCostOverride", async () => {
    vi.mocked(setManualCostOverride).mockResolvedValue({
      success: true,
      data: undefined,
    });

    renderSpreadsheet([{ ...baseIngredient, manualCostOverride: false }]);

    const unlockBtn = screen.getByRole("button", {
      name: /Cost is unlocked.*Milk/i,
    });
    fireEvent.click(unlockBtn);

    await waitFor(() => {
      expect(setManualCostOverride).toHaveBeenCalledWith("ing-1", true);
    });
  });

  it("clicking the read-only auto cost cell flips override back to true (Spec B2)", async () => {
    vi.mocked(setManualCostOverride).mockResolvedValue({
      success: true,
      data: undefined,
    });

    renderSpreadsheet([{ ...baseIngredient, manualCostOverride: false }]);

    // No editable input is rendered when override is off — it's a button.
    expect(screen.queryByLabelText("cost Milk")).toBeNull();
    const autoBtn = screen.getByLabelText("cost Milk (auto)");
    fireEvent.click(autoBtn);

    await waitFor(() => {
      // Flips lock back on without changing the cost value
      expect(setManualCostOverride).toHaveBeenCalledWith("ing-1", true);
    });
    expect(updateIngredientConfig).not.toHaveBeenCalled();
  });

  it("reverts the override flag if the toggle action fails", async () => {
    vi.mocked(setManualCostOverride).mockResolvedValue({
      success: false,
      error: "boom",
    });

    renderSpreadsheet([{ ...baseIngredient, manualCostOverride: true }]);

    const lockBtn = screen.getByRole("button", {
      name: /Cost is locked.*Milk/i,
    });
    fireEvent.click(lockBtn);

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith("boom");
    });
    // Lock icon still present (rolled back to manualCostOverride: true)
    expect(
      screen.getByRole("button", { name: /Cost is locked.*Milk/i })
    ).toBeDefined();
  });
});

// ─── Cost-cell atomicity (single setManualCostOverride call) ─────

describe("IngredientSpreadsheet — cost cell calls atomic action only", () => {
  it("editing cost while LOCKED writes via a single setManualCostOverride call (no updateIngredientConfig)", async () => {
    vi.mocked(setManualCostOverride).mockResolvedValue({
      success: true,
      data: undefined,
    });

    renderSpreadsheet([{ ...baseIngredient, manualCostOverride: true }]);

    const costInput = screen.getByLabelText("cost Milk") as HTMLInputElement;
    fireEvent.change(costInput, { target: { value: "4.20" } });
    fireEvent.blur(costInput);

    await waitFor(() => {
      expect(setManualCostOverride).toHaveBeenCalledWith("ing-1", true, 420);
    });
    // The two-step path is gone — only the atomic action is invoked.
    expect(setManualCostOverride).toHaveBeenCalledTimes(1);
    expect(updateIngredientConfig).not.toHaveBeenCalled();
  });

  it("clearing cost (empty input) calls setManualCostOverride(id, true, null) atomically", async () => {
    vi.mocked(setManualCostOverride).mockResolvedValue({
      success: true,
      data: undefined,
    });

    renderSpreadsheet([
      { ...baseIngredient, costPerUnitInCents: 250, manualCostOverride: true },
    ]);

    const costInput = screen.getByLabelText("cost Milk") as HTMLInputElement;
    expect(costInput.value).toBe("2.50");

    fireEvent.change(costInput, { target: { value: "" } });
    fireEvent.blur(costInput);

    await waitFor(() => {
      expect(setManualCostOverride).toHaveBeenCalledWith("ing-1", true, null);
    });
    // No fallback to updateIngredientConfig for the clear path
    expect(updateIngredientConfig).not.toHaveBeenCalled();
  });
});

// ─── Sub-cent display formatter ────────────────────────────────

describe("IngredientSpreadsheet — cost cell display formatter", () => {
  it("renders sub-cent value (0.5 cents) as 0.0050 in the cost cell", () => {
    renderSpreadsheet([
      { ...baseIngredient, costPerUnitInCents: 0.5 },
    ]);
    const costInput = screen.getByLabelText("cost Milk") as HTMLInputElement;
    expect(costInput.value).toBe("0.0050");
  });

  it("renders whole-cent value (250 cents) as 2.50 in the cost cell", () => {
    renderSpreadsheet([
      { ...baseIngredient, costPerUnitInCents: 250 },
    ]);
    const costInput = screen.getByLabelText("cost Milk") as HTMLInputElement;
    expect(costInput.value).toBe("2.50");
  });
});

// ─── Lock toggle button disables while pending ─────────────────

describe("IngredientSpreadsheet — lock toggle pending state", () => {
  it("disables the lock toggle button while the override action is pending", async () => {
    // Hang the action's promise so the transition stays pending until we resolve it
    let resolveAction: (v: { success: boolean; data?: undefined }) => void = () => {};
    vi.mocked(setManualCostOverride).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        }),
    );

    renderSpreadsheet([{ ...baseIngredient, manualCostOverride: true }]);

    const lockBtn = screen.getByRole("button", {
      name: /Cost is locked.*Milk/i,
    }) as HTMLButtonElement;
    expect(lockBtn.disabled).toBe(false);

    fireEvent.click(lockBtn);

    await waitFor(() => {
      const stillThere = screen.getByRole("button", {
        // Optimistic flip: was "locked", now reads "unlocked"
        name: /Cost is unlocked.*Milk/i,
      }) as HTMLButtonElement;
      expect(stillThere.disabled).toBe(true);
    });

    // Let the promise settle so the test doesn't leak
    resolveAction({ success: true, data: undefined });
  });
});

describe("IngredientSpreadsheet — Details button (inventory detail popup)", () => {
  const ingredientWithLots = {
    ...baseIngredient,
    ingredientPurchases: [
      {
        id: "p1",
        ingredientSupplierId: "linkA",
        supplierName: "Acme",
        quantity: 10,
        remainingQuantity: 7,
        unit: "L",
        totalPriceInCents: 1500,
        createdAt: "2026-04-15T10:00:00.000Z",
      },
    ],
  };

  it("opens the dialog when Details is clicked and closes via Close button", () => {
    render(
      <IngredientSpreadsheet
        initialIngredients={[ingredientWithLots]}
        suppliers={suppliers}
        distinctCategories={["Dairy"]}
      />
    );

    // Dialog not open initially
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(
      screen.getByLabelText("View inventory details for Milk")
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).not.toBeNull();
    // Lot row visible inside the dialog
    expect(dialog.textContent).toContain("Acme");
    expect(dialog.textContent).toContain("7/10 L");

    fireEvent.click(screen.getByLabelText("Close inventory details"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("IngredientSpreadsheet — unlock recomputes derived cost from FIFO lots", () => {
  // Locked at 150 ($1.50). One live lot: $8.00 / 10 units → $0.80/unit.
  // After server load while locked, derivedCostPerUnitInCents == costPerUnitInCents
  // (currentCostPerUnit short-circuits at the override check).
  const lockedIngredientWithLot = {
    ...baseIngredient,
    manualCostOverride: true,
    costPerUnitInCents: 150,
    derivedCostPerUnitInCents: 150,
    ingredientPurchases: [
      {
        id: "p1",
        ingredientSupplierId: "linkA",
        supplierName: "Acme",
        quantity: 10,
        remainingQuantity: 7,
        unit: "L",
        totalPriceInCents: 800,
        createdAt: "2026-04-15T10:00:00.000Z",
      },
    ],
  };

  it("immediately switches the cost cell from manual to lot-derived on unlock", async () => {
    vi.mocked(setManualCostOverride).mockResolvedValue({
      success: true,
      data: undefined,
    });

    render(
      <IngredientSpreadsheet
        initialIngredients={[lockedIngredientWithLot]}
        suppliers={suppliers}
        distinctCategories={["Dairy"]}
      />
    );

    // Locked: editable input shows the manual cost
    const costInput = screen.getByLabelText("cost Milk") as HTMLInputElement;
    expect(costInput.value).toBe("1.50");

    fireEvent.click(
      screen.getByRole("button", { name: /Cost is locked.*Milk/i })
    );

    // After unlock the editable input is replaced by the auto cell — assert
    // the lot-derived cost is shown immediately (no router refresh needed).
    await waitFor(() => {
      const autoBtn = screen.getByRole("button", { name: /cost Milk \(auto\)/i });
      expect(autoBtn.textContent).toContain("(Auto) $0.80");
    });
  });

  it("falls back to manual cost on unlock when no live lots exist", async () => {
    vi.mocked(setManualCostOverride).mockResolvedValue({
      success: true,
      data: undefined,
    });

    const lockedNoLots = { ...lockedIngredientWithLot, ingredientPurchases: [] };
    render(
      <IngredientSpreadsheet
        initialIngredients={[lockedNoLots]}
        suppliers={suppliers}
        distinctCategories={["Dairy"]}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Cost is locked.*Milk/i })
    );

    await waitFor(() => {
      const autoBtn = screen.getByRole("button", { name: /cost Milk \(auto\)/i });
      // Per currentCostPerUnit precedence: no override + no lot → manual cost fallback
      expect(autoBtn.textContent).toContain("(Auto) $1.50");
    });
  });

  it("rolls both fields back when the action fails", async () => {
    vi.mocked(setManualCostOverride).mockResolvedValue({
      success: false,
      error: "Forbidden",
    });

    render(
      <IngredientSpreadsheet
        initialIngredients={[lockedIngredientWithLot]}
        suppliers={suppliers}
        distinctCategories={["Dairy"]}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Cost is locked.*Milk/i })
    );

    // Action fails → rollback restores both manualCostOverride AND the
    // pre-toggle derived cost. The editable input is back at the manual value.
    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith("Forbidden");
    });
    const costInput = screen.getByLabelText("cost Milk") as HTMLInputElement;
    expect(costInput.value).toBe("1.50");
  });
});

// ─── Spec: advanced-columns toggle (Display / Snap / Container / Units/container) ───

describe("IngredientSpreadsheet — advanced columns toggle", () => {
  it("hides Display, Snap, Container, Units/container columnheaders by default", () => {
    // Force fresh state: localStorage starts empty for this test.
    const getItemSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockReturnValue(null);

    renderSpreadsheet();

    expect(
      screen.queryByRole("columnheader", { name: "Display" })
    ).toBeNull();
    expect(
      screen.queryByRole("columnheader", { name: "Snap" })
    ).toBeNull();
    expect(
      screen.queryByRole("columnheader", { name: "Container" })
    ).toBeNull();
    expect(
      screen.queryByRole("columnheader", { name: "Units/container" })
    ).toBeNull();

    getItemSpy.mockRestore();
  });

  it("reveals the four advanced columnheaders after clicking the toggle", () => {
    const getItemSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockReturnValue(null);
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {});

    renderSpreadsheet();

    // Pre-condition: hidden by default
    expect(
      screen.queryByRole("columnheader", { name: "Display" })
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: /Show advanced columns/i })
    );

    expect(
      screen.getByRole("columnheader", { name: "Display" })
    ).toBeDefined();
    expect(
      screen.getByRole("columnheader", { name: "Snap" })
    ).toBeDefined();
    expect(
      screen.getByRole("columnheader", { name: "Container" })
    ).toBeDefined();
    expect(
      screen.getByRole("columnheader", { name: "Units/container" })
    ).toBeDefined();

    // Persistence: the toggle should have written "true" to localStorage
    expect(setItemSpy).toHaveBeenCalledWith(
      "ingredients.showAdvancedColumns",
      "true"
    );

    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
  });

  it("hydrates from localStorage and shows advanced columns from first paint", () => {
    const getItemSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation((key: string) =>
        key === "ingredients.showAdvancedColumns" ? "true" : null
      );

    renderSpreadsheet();

    expect(
      screen.getByRole("columnheader", { name: "Display" })
    ).toBeDefined();
    expect(
      screen.getByRole("columnheader", { name: "Snap" })
    ).toBeDefined();
    expect(
      screen.getByRole("columnheader", { name: "Container" })
    ).toBeDefined();
    expect(
      screen.getByRole("columnheader", { name: "Units/container" })
    ).toBeDefined();

    getItemSpy.mockRestore();
  });
});
