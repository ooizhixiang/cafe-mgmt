import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/actions/setup.actions", () => ({
  setMinMarginPercent: vi.fn(),
}));

const toastSpy = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: toastSpy }),
}));

import { MinMarginSettings } from "./min-margin";
import { setMinMarginPercent } from "@/actions/setup.actions";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MinMarginSettings", () => {
  it("renders the initial value as the input value", () => {
    render(<MinMarginSettings initialValue={20} isManager />);
    const input = screen.getByLabelText(
      "Minimum margin percent"
    ) as HTMLInputElement;
    expect(input.value).toBe("20");
  });

  it("calls the action onBlur with the new integer", async () => {
    vi.mocked(setMinMarginPercent).mockResolvedValue({
      success: true,
      data: { minMarginPercent: 30 },
    });

    render(<MinMarginSettings initialValue={20} isManager />);
    const input = screen.getByLabelText(
      "Minimum margin percent"
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "30" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(setMinMarginPercent).toHaveBeenCalledWith(30);
    });
    expect(toastSpy).toHaveBeenCalledWith("Margin floor saved");
  });

  it("rejects non-integer input client-side without calling the action", () => {
    render(<MinMarginSettings initialValue={20} isManager />);
    const input = screen.getByLabelText(
      "Minimum margin percent"
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "20.5" } });
    fireEvent.blur(input);
    expect(setMinMarginPercent).not.toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith(
      expect.stringMatching(/whole number/i)
    );
    // Reverted to initial value on rejection
    expect(input.value).toBe("20");
  });

  it("rejects out-of-range values client-side", () => {
    render(<MinMarginSettings initialValue={20} isManager />);
    const input = screen.getByLabelText(
      "Minimum margin percent"
    ) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "100" } });
    fireEvent.blur(input);
    expect(setMinMarginPercent).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "-5" } });
    fireEvent.blur(input);
    expect(setMinMarginPercent).not.toHaveBeenCalled();
  });

  it("rolls back the input on action failure", async () => {
    vi.mocked(setMinMarginPercent).mockResolvedValue({
      success: false,
      error: "Server error",
    });

    render(<MinMarginSettings initialValue={20} isManager />);
    const input = screen.getByLabelText(
      "Minimum margin percent"
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "30" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith("Server error");
    });
    expect(input.value).toBe("20");
  });

  it("disables the input for STAFF (read-only)", () => {
    render(<MinMarginSettings initialValue={20} isManager={false} />);
    const input = screen.getByLabelText(
      "Minimum margin percent"
    ) as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });
});
