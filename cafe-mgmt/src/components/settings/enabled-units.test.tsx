import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/actions/setup.actions", () => ({
  setCafeEnabledUnits: vi.fn(),
}));

const toastSpy = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: toastSpy }),
}));

import { EnabledUnitsEditor } from "./enabled-units";
import { setCafeEnabledUnits } from "@/actions/setup.actions";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EnabledUnitsEditor — built-in toggle", () => {
  it("renders the 5 default checkboxes as checked, others unchecked", () => {
    render(
      <EnabledUnitsEditor
        initialEnabledUnits={["kg", "g", "L", "mL", "each"]}
        isManager
      />
    );
    expect((screen.getByLabelText("Enable kg") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Enable g") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Enable each") as HTMLInputElement).checked).toBe(true);
    // Not in the default list
    expect((screen.getByLabelText("Enable tsp") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText("Enable lb") as HTMLInputElement).checked).toBe(false);
  });

  it("toggling a unit on calls the action with the new list (additive)", async () => {
    vi.mocked(setCafeEnabledUnits).mockResolvedValue({
      success: true,
      data: { enabledUnits: ["kg", "g", "tsp"] },
    });

    render(
      <EnabledUnitsEditor initialEnabledUnits={["kg", "g"]} isManager />
    );

    fireEvent.click(screen.getByLabelText("Enable tsp"));
    await waitFor(() => {
      expect(setCafeEnabledUnits).toHaveBeenCalledWith(["kg", "g", "tsp"]);
    });
    // Optimistic flip happened immediately
    expect((screen.getByLabelText("Enable tsp") as HTMLInputElement).checked).toBe(true);
  });

  it("toggling a unit off removes it from the list", async () => {
    vi.mocked(setCafeEnabledUnits).mockResolvedValue({
      success: true,
      data: { enabledUnits: ["g"] },
    });

    render(
      <EnabledUnitsEditor initialEnabledUnits={["kg", "g"]} isManager />
    );

    fireEvent.click(screen.getByLabelText("Enable kg"));
    await waitFor(() => {
      expect(setCafeEnabledUnits).toHaveBeenCalledWith(["g"]);
    });
  });

  it("rolls back optimistic state and toasts on action failure", async () => {
    vi.mocked(setCafeEnabledUnits).mockResolvedValue({
      success: false,
      error: "Server exploded",
    });

    render(
      <EnabledUnitsEditor initialEnabledUnits={["kg", "g"]} isManager />
    );

    fireEvent.click(screen.getByLabelText("Enable tsp"));
    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith("Server exploded");
    });
    // Rolled back — tsp is unchecked again
    expect((screen.getByLabelText("Enable tsp") as HTMLInputElement).checked).toBe(false);
  });
});

describe("EnabledUnitsEditor — empty-state warning", () => {
  it("shows an alert when the list is empty", () => {
    render(<EnabledUnitsEditor initialEnabledUnits={[]} isManager />);
    expect(
      screen.getByRole("alert").textContent
    ).toMatch(/Enable at least one unit/i);
  });

  it("does not show the warning when at least one unit is enabled", () => {
    render(<EnabledUnitsEditor initialEnabledUnits={["kg"]} isManager />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("EnabledUnitsEditor — STAFF read-only", () => {
  it("disables every checkbox for STAFF role", () => {
    render(
      <EnabledUnitsEditor
        initialEnabledUnits={["kg", "g"]}
        isManager={false}
      />
    );
    expect((screen.getByLabelText("Enable kg") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Enable tsp") as HTMLInputElement).disabled).toBe(true);
  });

  it("hides the custom-unit add input from STAFF", () => {
    render(
      <EnabledUnitsEditor
        initialEnabledUnits={["kg"]}
        isManager={false}
      />
    );
    expect(screen.queryByLabelText("New custom unit")).toBeNull();
  });
});

describe("EnabledUnitsEditor — custom units", () => {
  it("adds a custom unit via the input", async () => {
    vi.mocked(setCafeEnabledUnits).mockResolvedValue({
      success: true,
      data: { enabledUnits: ["kg", "scoop"] },
    });

    render(
      <EnabledUnitsEditor initialEnabledUnits={["kg"]} isManager />
    );

    fireEvent.change(screen.getByLabelText("New custom unit"), {
      target: { value: "scoop" },
    });
    fireEvent.click(screen.getByLabelText("Add custom unit"));

    await waitFor(() => {
      expect(setCafeEnabledUnits).toHaveBeenCalledWith(["kg", "scoop"]);
    });
    expect(screen.getByText("scoop")).not.toBeNull();
  });

  it("rejects an invalid custom unit (whitespace) with a toast and does NOT call the action", () => {
    render(
      <EnabledUnitsEditor initialEnabledUnits={["kg"]} isManager />
    );

    fireEvent.change(screen.getByLabelText("New custom unit"), {
      target: { value: "fl oz" },
    });
    fireEvent.click(screen.getByLabelText("Add custom unit"));

    expect(toastSpy).toHaveBeenCalledWith(
      expect.stringMatching(/whitespace/i)
    );
    expect(setCafeEnabledUnits).not.toHaveBeenCalled();
  });

  it("removes a custom unit via the trash button", async () => {
    vi.mocked(setCafeEnabledUnits).mockResolvedValue({
      success: true,
      data: { enabledUnits: ["kg"] },
    });

    render(
      <EnabledUnitsEditor
        initialEnabledUnits={["kg", "scoop"]}
        isManager
      />
    );

    fireEvent.click(screen.getByLabelText("Remove custom unit scoop"));
    await waitFor(() => {
      expect(setCafeEnabledUnits).toHaveBeenCalledWith(["kg"]);
    });
  });

  it("rejects adding a unit that's already enabled", () => {
    render(
      <EnabledUnitsEditor initialEnabledUnits={["kg", "scoop"]} isManager />
    );

    fireEvent.change(screen.getByLabelText("New custom unit"), {
      target: { value: "scoop" },
    });
    fireEvent.click(screen.getByLabelText("Add custom unit"));

    expect(toastSpy).toHaveBeenCalledWith("Unit is already enabled");
    expect(setCafeEnabledUnits).not.toHaveBeenCalled();
  });
});
