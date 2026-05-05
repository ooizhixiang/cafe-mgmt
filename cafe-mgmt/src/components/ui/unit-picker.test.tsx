import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UnitPicker } from "./unit-picker";

describe("UnitPicker", () => {
  it("renders one <option> per enabled unit when value is in the list", () => {
    render(
      <UnitPicker
        value="g"
        onChange={vi.fn()}
        enabledUnits={["kg", "g", "L"]}
        ariaLabel="Test unit"
      />
    );
    const select = screen.getByLabelText("Test unit") as HTMLSelectElement;
    expect(select.value).toBe("g");
    expect(Array.from(select.options).map((o) => o.value)).toEqual(["kg", "g", "L"]);
  });

  it("prepends a '(custom)' option when value is not in the enabled list (legacy data)", () => {
    render(
      <UnitPicker
        value="kgs"
        onChange={vi.fn()}
        enabledUnits={["kg", "g", "L"]}
        ariaLabel="Legacy unit"
      />
    );
    const select = screen.getByLabelText("Legacy unit") as HTMLSelectElement;
    expect(select.value).toBe("kgs");
    const optionTexts = Array.from(select.options).map((o) => o.textContent);
    expect(optionTexts[0]).toBe("kgs (custom)");
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      "kgs",
      "kg",
      "g",
      "L",
    ]);
  });

  it("calls onChange when the user picks a different unit", () => {
    const onChange = vi.fn();
    render(
      <UnitPicker
        value="kg"
        onChange={onChange}
        enabledUnits={["kg", "g"]}
        ariaLabel="Pick unit"
      />
    );
    fireEvent.change(screen.getByLabelText("Pick unit"), {
      target: { value: "g" },
    });
    expect(onChange).toHaveBeenCalledWith("g");
  });

  it("respects the disabled prop", () => {
    render(
      <UnitPicker
        value="kg"
        onChange={vi.fn()}
        enabledUnits={["kg"]}
        ariaLabel="Locked unit"
        disabled
      />
    );
    expect(
      (screen.getByLabelText("Locked unit") as HTMLSelectElement).disabled
    ).toBe(true);
  });

  it("renders a placeholder option when no units are enabled and there is no current value", () => {
    render(
      <UnitPicker
        value=""
        onChange={vi.fn()}
        enabledUnits={[]}
        ariaLabel="Empty"
      />
    );
    const select = screen.getByLabelText("Empty") as HTMLSelectElement;
    expect(select.options[0]!.textContent).toBe("(no units enabled)");
  });

  it("renders a disabled 'Select unit…' placeholder when value is empty AND units are enabled", () => {
    // Without the placeholder, a controlled <select value=""> with no
    // empty option visually snaps to the first option while React state
    // stays "" — silent state/DOM mismatch trap.
    render(
      <UnitPicker
        value=""
        onChange={vi.fn()}
        enabledUnits={["kg", "g"]}
        ariaLabel="With placeholder"
      />
    );
    const select = screen.getByLabelText("With placeholder") as HTMLSelectElement;
    expect(select.value).toBe("");
    const placeholder = select.options[0]!;
    expect(placeholder.textContent).toBe("Select unit…");
    expect(placeholder.disabled).toBe(true);
  });
});
