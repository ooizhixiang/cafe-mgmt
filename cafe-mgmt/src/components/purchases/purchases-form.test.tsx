import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock the server action
vi.mock("@/actions/inventory.actions", () => ({
  bulkCreateIngredientPurchases: vi.fn(),
}));

// Mock the toast context to avoid wrapping in provider
const toastSpy = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: toastSpy }),
}));

import { bulkCreateIngredientPurchases } from "@/actions/inventory.actions";
import { PurchasesForm } from "./purchases-form";

const suppliers = [
  {
    id: "sup1",
    name: "Acme Foods",
    links: [
      {
        id: "link-milk",
        ingredientId: "ing-milk",
        ingredientName: "Milk",
        unit: "L",
        priceInCents: 350, // 3.50
      },
      {
        id: "link-sugar",
        ingredientId: "ing-sugar",
        ingredientName: "Sugar",
        unit: "kg",
        priceInCents: 200, // 2.00
      },
    ],
  },
  {
    id: "sup2",
    name: "Beta Foods",
    links: [],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

function pickSupplier(supplierId: string) {
  fireEvent.change(screen.getByLabelText("Supplier"), {
    target: { value: supplierId },
  });
}

function pickIngredient(lineNum: number, ingredientId: string) {
  fireEvent.change(screen.getByLabelText(`Ingredient line ${lineNum}`), {
    target: { value: ingredientId },
  });
}

describe("PurchasesForm — prefill and recompute", () => {
  it("prefills unit and unit price from the supplier link", () => {
    render(
      <PurchasesForm initialSuppliers={suppliers} />
    );
    pickSupplier("sup1");
    pickIngredient(1, "ing-milk");

    expect(
      (screen.getByLabelText("Unit line 1") as HTMLInputElement).value
    ).toBe("L");
    expect(
      (screen.getByLabelText("Unit price line 1") as HTMLInputElement).value
    ).toBe("3.50");
  });

  it("recomputes total when quantity changes (before override)", () => {
    render(
      <PurchasesForm initialSuppliers={suppliers} />
    );
    pickSupplier("sup1");
    pickIngredient(1, "ing-milk");

    fireEvent.change(screen.getByLabelText("Quantity line 1"), {
      target: { value: "4" },
    });

    expect(
      (screen.getByLabelText("Total line 1") as HTMLInputElement).value
    ).toBe("14.00"); // 4 * 3.50
  });

  it("resets total override when ingredient is changed on the same line", () => {
    render(
      <PurchasesForm initialSuppliers={suppliers} />
    );
    pickSupplier("sup1");
    pickIngredient(1, "ing-milk");
    fireEvent.change(screen.getByLabelText("Quantity line 1"), {
      target: { value: "2" },
    });
    // Manually override total
    fireEvent.change(screen.getByLabelText("Total line 1"), {
      target: { value: "9.99" },
    });
    expect(
      (screen.getByLabelText("Total line 1") as HTMLInputElement).value
    ).toBe("9.99");

    // Change ingredient — total should re-derive, not keep stale 9.99
    pickIngredient(1, "ing-sugar"); // sugar prefill = 2.00/kg
    expect(
      (screen.getByLabelText("Total line 1") as HTMLInputElement).value
    ).toBe("4.00"); // qty=2 × 2.00 = 4.00 (override cleared)
  });

  it("prompts to confirm when changing supplier with populated lines", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <PurchasesForm initialSuppliers={suppliers} />
    );
    pickSupplier("sup1");
    pickIngredient(1, "ing-milk");
    fireEvent.change(screen.getByLabelText("Quantity line 1"), {
      target: { value: "3" },
    });

    pickSupplier("sup2");
    expect(confirmSpy).toHaveBeenCalledOnce();
    // Cancelled — supplier and lines unchanged
    expect((screen.getByLabelText("Supplier") as HTMLSelectElement).value).toBe("sup1");
    expect((screen.getByLabelText("Quantity line 1") as HTMLInputElement).value).toBe("3");

    confirmSpy.mockRestore();
  });

  it("stops recomputing total after manual override", () => {
    render(
      <PurchasesForm initialSuppliers={suppliers} />
    );
    pickSupplier("sup1");
    pickIngredient(1, "ing-milk");

    fireEvent.change(screen.getByLabelText("Quantity line 1"), {
      target: { value: "2" },
    });
    expect(
      (screen.getByLabelText("Total line 1") as HTMLInputElement).value
    ).toBe("7.00");

    // Manually override total
    fireEvent.change(screen.getByLabelText("Total line 1"), {
      target: { value: "9.99" },
    });
    // Change qty after override — total stays put
    fireEvent.change(screen.getByLabelText("Quantity line 1"), {
      target: { value: "5" },
    });
    expect(
      (screen.getByLabelText("Total line 1") as HTMLInputElement).value
    ).toBe("9.99");
  });
});

describe("PurchasesForm — picker restriction", () => {
  it("ingredient dropdown lists only the supplier's linked ingredients", () => {
    render(<PurchasesForm initialSuppliers={suppliers} />);
    pickSupplier("sup1");

    const select = screen.getByLabelText("Ingredient line 1") as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent?.trim());
    // "Choose…" placeholder + Milk + Sugar (both linked to sup1, alphabetical)
    expect(optionLabels).toEqual(["Choose…", "Milk", "Sugar"]);
  });

  it("shows empty-state message when supplier has no linked ingredients", () => {
    render(<PurchasesForm initialSuppliers={suppliers} />);
    pickSupplier("sup2"); // sup2 has zero links

    expect(
      screen.getByText(/this supplier has no products yet/i)
    ).toBeDefined();
    // Line editor and submit button are gone
    expect(screen.queryByLabelText("Ingredient line 1")).toBeNull();
    expect(screen.queryByRole("button", { name: /log purchases/i })).toBeNull();
    // Supplier dropdown still usable
    expect((screen.getByLabelText("Supplier") as HTMLSelectElement).value).toBe("sup2");
  });
});

describe("PurchasesForm — submit", () => {
  it("submits linked-ingredient line with ingredientSupplierId", async () => {
    vi.mocked(bulkCreateIngredientPurchases).mockResolvedValue({
      success: true,
      data: { ids: ["pur1"] },
    });

    render(
      <PurchasesForm initialSuppliers={suppliers} />
    );
    pickSupplier("sup1");
    pickIngredient(1, "ing-milk");
    fireEvent.change(screen.getByLabelText("Quantity line 1"), {
      target: { value: "3" },
    });

    fireEvent.click(screen.getByRole("button", { name: /log purchases/i }));

    await waitFor(() => {
      expect(bulkCreateIngredientPurchases).toHaveBeenCalled();
    });
    const arg = vi.mocked(bulkCreateIngredientPurchases).mock.calls[0]![0];
    const line = arg.lines[0]!;
    expect(line.ingredientSupplierId).toBe("link-milk");
    expect(line.totalPriceInCents).toBe(1050); // 3 × 3.50
  });

  it("blocks submit on duplicate ingredient and toasts the conflicting name", async () => {
    render(
      <PurchasesForm initialSuppliers={suppliers} />
    );
    pickSupplier("sup1");
    pickIngredient(1, "ing-milk");
    fireEvent.change(screen.getByLabelText("Quantity line 1"), {
      target: { value: "1" },
    });

    fireEvent.click(screen.getByRole("button", { name: /add line/i }));

    pickIngredient(2, "ing-milk");
    fireEvent.change(screen.getByLabelText("Quantity line 2"), {
      target: { value: "1" },
    });

    fireEvent.click(screen.getByRole("button", { name: /log purchases/i }));

    expect(toastSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Milk appears twice/i)
    );
    expect(bulkCreateIngredientPurchases).not.toHaveBeenCalled();
  });

  it("resets form after success", async () => {
    vi.mocked(bulkCreateIngredientPurchases).mockResolvedValue({
      success: true,
      data: { ids: ["pur1"] },
    });

    render(
      <PurchasesForm initialSuppliers={suppliers} />
    );
    pickSupplier("sup1");
    pickIngredient(1, "ing-milk");
    fireEvent.change(screen.getByLabelText("Quantity line 1"), {
      target: { value: "2" },
    });

    fireEvent.click(screen.getByRole("button", { name: /log purchases/i }));

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith(
        expect.stringMatching(/1 purchase/i)
      );
    });

    // After reset, line 1's ingredient and quantity are blank again
    await waitFor(() => {
      expect(
        (screen.getByLabelText("Quantity line 1") as HTMLInputElement).value
      ).toBe("");
    });
    expect(
      (screen.getByLabelText("Ingredient line 1") as HTMLSelectElement).value
    ).toBe("");
  });

  it("keeps form state on action failure and shows error toast", async () => {
    vi.mocked(bulkCreateIngredientPurchases).mockResolvedValue({
      success: false,
      error: "Something exploded",
    });

    render(
      <PurchasesForm initialSuppliers={suppliers} />
    );
    pickSupplier("sup1");
    pickIngredient(1, "ing-milk");
    fireEvent.change(screen.getByLabelText("Quantity line 1"), {
      target: { value: "2" },
    });

    fireEvent.click(screen.getByRole("button", { name: /log purchases/i }));

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith("Something exploded");
    });

    // Form values still present
    expect(
      (screen.getByLabelText("Quantity line 1") as HTMLInputElement).value
    ).toBe("2");
    expect(
      (screen.getByLabelText("Ingredient line 1") as HTMLSelectElement).value
    ).toBe("ing-milk");
  });
});
