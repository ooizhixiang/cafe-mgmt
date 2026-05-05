import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import {
  InventoryDetailDialog,
  buildSupplierGroups,
} from "./inventory-detail-dialog";
import type { IngredientPurchaseRow } from "./ingredient-suppliers-panel";

function lot(over: Partial<IngredientPurchaseRow>): IngredientPurchaseRow {
  return {
    id: "p1",
    ingredientSupplierId: "link1",
    supplierName: "Acme",
    quantity: 10,
    remainingQuantity: 10,
    unit: "kg",
    totalPriceInCents: 1000,
    createdAt: "2026-04-15T10:00:00.000Z",
    ...over,
  };
}

describe("buildSupplierGroups", () => {
  it("happy path: groups by supplier and orders lots oldest-first within each, suppliers by oldest live lot", () => {
    const purchases = [
      lot({ id: "p1", ingredientSupplierId: "linkA", supplierName: "Acme", createdAt: "2026-04-20T10:00:00Z" }),
      lot({ id: "p2", ingredientSupplierId: "linkA", supplierName: "Acme", createdAt: "2026-04-10T10:00:00Z" }),
      lot({ id: "p3", ingredientSupplierId: "linkB", supplierName: "Beta",  createdAt: "2026-04-15T10:00:00Z" }),
    ];
    const groups = buildSupplierGroups(purchases);
    expect(groups.map((g) => g.supplierName)).toEqual(["Acme", "Beta"]);
    expect(groups[0]!.lots.map((l) => l.id)).toEqual(["p2", "p1"]);
    expect(groups[1]!.lots.map((l) => l.id)).toEqual(["p3"]);
  });

  it("hides depleted lots inside a supplier and the supplier itself when all lots are 0", () => {
    const purchases = [
      lot({ id: "pA1", ingredientSupplierId: "linkA", supplierName: "Acme", remainingQuantity: 0 }),
      lot({ id: "pA2", ingredientSupplierId: "linkA", supplierName: "Acme", remainingQuantity: 5 }),
      lot({ id: "pB1", ingredientSupplierId: "linkB", supplierName: "Beta", remainingQuantity: 0 }),
    ];
    const groups = buildSupplierGroups(purchases);
    expect(groups.map((g) => g.supplierName)).toEqual(["Acme"]);
    expect(groups[0]!.lots.map((l) => l.id)).toEqual(["pA2"]);
    expect(groups[0]!.totalRemaining).toBe(5);
  });

  it("returns empty when every lot is depleted", () => {
    const purchases = [
      lot({ remainingQuantity: 0 }),
      lot({ id: "p2", remainingQuantity: 0 }),
    ];
    expect(buildSupplierGroups(purchases)).toEqual([]);
  });

  it("returns empty for no purchases", () => {
    expect(buildSupplierGroups([])).toEqual([]);
  });

  it("tie-breaks identical createdAt by id ascending (matches consumeFifo ordering)", () => {
    const ts = "2026-04-15T10:00:00.000Z";
    const purchases = [
      lot({ id: "pZ", ingredientSupplierId: "linkA", supplierName: "Acme", createdAt: ts }),
      lot({ id: "pA", ingredientSupplierId: "linkA", supplierName: "Acme", createdAt: ts }),
    ];
    const groups = buildSupplierGroups(purchases);
    expect(groups[0]!.lots.map((l) => l.id)).toEqual(["pA", "pZ"]);
  });
});

describe("InventoryDetailDialog", () => {
  it("renders nothing when open is false", () => {
    const { container } = render(
      <InventoryDetailDialog
        open={false}
        ingredientName="Milk"
        ingredientUnit="L"
        purchases={[lot({})]}
        onClose={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("happy path: shows two suppliers with their live lots, oldest-first within each", () => {
    const purchases = [
      lot({ id: "pA1", ingredientSupplierId: "linkA", supplierName: "Acme", remainingQuantity: 4, quantity: 10, createdAt: "2026-04-20T10:00:00Z" }),
      lot({ id: "pA2", ingredientSupplierId: "linkA", supplierName: "Acme", remainingQuantity: 8, quantity: 8,  createdAt: "2026-04-10T10:00:00Z" }),
      lot({ id: "pB1", ingredientSupplierId: "linkB", supplierName: "Beta", remainingQuantity: 6, quantity: 6,  createdAt: "2026-04-15T10:00:00Z" }),
    ];
    render(
      <InventoryDetailDialog
        open
        ingredientName="Milk"
        ingredientUnit="L"
        purchases={purchases}
        onClose={vi.fn()}
      />
    );
    const dialog = screen.getByRole("dialog");
    const supplierItems = within(dialog).getAllByRole("listitem");
    // Top-level <li> per supplier first, then per-lot <li>s nested
    const supplierHeaders = within(dialog).getAllByText(/Acme|Beta/);
    expect(supplierHeaders[0]!.textContent).toBe("Acme"); // Acme's oldest lot (Apr 10) is older than Beta's (Apr 15)
    expect(supplierHeaders[1]!.textContent).toBe("Beta");
    // Acme's subtitle reflects total remaining (8 + 4 = 12) across 2 lots
    expect(within(dialog).getByText(/12 L remaining across 2 live lots/)).not.toBeNull();
    // Beta's subtitle: 6 across 1 live lot (singular)
    expect(within(dialog).getByText(/6 L remaining across 1 live lot$/)).not.toBeNull();
    // Lots show remaining/original
    expect(within(dialog).getByText(/8\/8 kg/)).not.toBeNull();
    expect(within(dialog).getByText(/4\/10 kg/)).not.toBeNull();
    expect(within(dialog).getByText(/6\/6 kg/)).not.toBeNull();
    // Should not see all-empty or no-purchase states
    expect(within(dialog).queryByText(/No purchases logged/)).toBeNull();
    expect(within(dialog).queryByText(/No remaining stock/)).toBeNull();
    // listitem count = 2 supplier items + 3 lot items = 5
    expect(supplierItems.length).toBe(5);
  });

  it("hides supplier whose every lot is depleted", () => {
    const purchases = [
      lot({ id: "pA1", ingredientSupplierId: "linkA", supplierName: "Acme", remainingQuantity: 0 }),
      lot({ id: "pB1", ingredientSupplierId: "linkB", supplierName: "Beta", remainingQuantity: 5 }),
    ];
    render(
      <InventoryDetailDialog
        open
        ingredientName="Milk"
        ingredientUnit="L"
        purchases={purchases}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByText("Acme")).toBeNull();
    expect(screen.getByText("Beta")).not.toBeNull();
  });

  it("shows the all-exhausted empty state when no live lots remain", () => {
    const purchases = [lot({ remainingQuantity: 0 })];
    render(
      <InventoryDetailDialog
        open
        ingredientName="Milk"
        ingredientUnit="L"
        purchases={purchases}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/No remaining stock from any supplier/)).not.toBeNull();
    // Different empty state — not the "no purchases ever" message
    expect(screen.queryByText(/No purchases logged/)).toBeNull();
  });

  it("shows the no-purchases-ever empty state when purchases is empty", () => {
    render(
      <InventoryDetailDialog
        open
        ingredientName="Milk"
        ingredientUnit="L"
        purchases={[]}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/No purchases logged for this ingredient yet/)).not.toBeNull();
    expect(screen.queryByText(/No remaining stock/)).toBeNull();
  });

  it("renders historical supplier name even if the link is conceptually deleted (supplierName still on the lot)", () => {
    const purchases = [
      lot({ supplierName: "Old Vendor (archived)", remainingQuantity: 3 }),
    ];
    render(
      <InventoryDetailDialog
        open
        ingredientName="Milk"
        ingredientUnit="L"
        purchases={purchases}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("Old Vendor (archived)")).not.toBeNull();
  });

  it("calls onClose when the Close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <InventoryDetailDialog
        open
        ingredientName="Milk"
        ingredientUnit="L"
        purchases={[lot({})]}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByLabelText("Close inventory details"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when mousedown+click both happen on the backdrop", () => {
    const onClose = vi.fn();
    render(
      <InventoryDetailDialog
        open
        ingredientName="Milk"
        ingredientUnit="L"
        purchases={[lot({})]}
        onClose={onClose}
      />
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.mouseDown(dialog);
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT close when click happens on inner card content", () => {
    const onClose = vi.fn();
    render(
      <InventoryDetailDialog
        open
        ingredientName="Milk"
        ingredientUnit="L"
        purchases={[lot({})]}
        onClose={onClose}
      />
    );
    const heading = screen.getByText("Milk");
    fireEvent.mouseDown(heading);
    fireEvent.click(heading);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does NOT close on text-selection drag from inside the card to the backdrop", () => {
    // Repro: mousedown inside card (e.g. selecting lot text), drag, mouseup on backdrop.
    // The click event bubbles to the backdrop's common ancestor; without mousedown tracking
    // this would close the dialog mid-selection.
    const onClose = vi.fn();
    render(
      <InventoryDetailDialog
        open
        ingredientName="Milk"
        ingredientUnit="L"
        purchases={[lot({})]}
        onClose={onClose}
      />
    );
    const dialog = screen.getByRole("dialog");
    const heading = screen.getByText("Milk");
    fireEvent.mouseDown(heading);
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(
      <InventoryDetailDialog
        open
        ingredientName="Milk"
        ingredientUnit="L"
        purchases={[lot({})]}
        onClose={onClose}
      />
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("focuses the Close button when opened", () => {
    render(
      <InventoryDetailDialog
        open
        ingredientName="Milk"
        ingredientUnit="L"
        purchases={[lot({})]}
        onClose={vi.fn()}
      />
    );
    expect(document.activeElement).toBe(screen.getByLabelText("Close inventory details"));
  });
});

describe("InventoryDetailDialog — displayUnit conversion", () => {
  it("renders lot quantities in the displayUnit when set and compatible", () => {
    // 1 L stored, displayUnit=mL → should render "1000/1000 mL"
    render(
      <InventoryDetailDialog
        open
        ingredientName="Milk"
        ingredientUnit="L"
        displayUnit="mL"
        purchases={[lot({ quantity: 1, remainingQuantity: 1, unit: "L" })]}
        onClose={vi.fn()}
      />
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("1000/1000 mL");
    // Subtitle should also be in mL
    expect(dialog.textContent).toContain("1000 mL remaining");
  });

  it("falls back to the lot's stored unit when displayUnit is unset", () => {
    render(
      <InventoryDetailDialog
        open
        ingredientName="Milk"
        ingredientUnit="L"
        purchases={[lot({ quantity: 1, remainingQuantity: 1, unit: "L" })]}
        onClose={vi.fn()}
      />
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("1/1 L");
  });

  it("falls back to the lot's stored unit when displayUnit is in a different dimension", () => {
    // Stored as L (volume); displayUnit kg (mass) — incompatible. No conversion.
    render(
      <InventoryDetailDialog
        open
        ingredientName="Milk"
        ingredientUnit="L"
        displayUnit="kg"
        purchases={[lot({ quantity: 1, remainingQuantity: 1, unit: "L" })]}
        onClose={vi.fn()}
      />
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("1/1 L");
  });
});
