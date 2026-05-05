import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/actions/inventory.actions", () => ({
  attachPurchaseInvoice: vi.fn(),
  detachPurchaseInvoice: vi.fn(),
}));

const toastSpy = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: toastSpy }),
}));

import {
  PurchaseHistoryList,
  type SerializableReceipt,
} from "./purchase-history-list";
import {
  attachPurchaseInvoice,
  detachPurchaseInvoice,
} from "@/actions/inventory.actions";

function makeReceipt(over: Partial<SerializableReceipt> = {}): SerializableReceipt {
  return {
    batchKey: "sup-A|user-1|2026-04-29T10:30:00.000Z",
    supplierId: "sup-A",
    supplierName: "Acme",
    createdById: "user-1",
    createdByName: "Alice",
    minuteStart: "2026-04-29T10:30:00.000Z",
    totalInCents: 1500,
    invoiceImageUrl: null,
    lines: [
      {
        id: "p1",
        ingredientId: "ing-1",
        ingredientName: "Coffee",
        supplierName: "Acme",
        quantity: 2,
        unit: "kg",
        totalPriceInCents: 1500,
        createdAt: "2026-04-29T10:30:15.000Z",
      },
    ],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PurchaseHistoryList — empty + read-only states", () => {
  it("renders the empty state when there are no receipts", () => {
    render(
      <PurchaseHistoryList
        initialReceipts={[]}
        page={0}
        totalReceipts={0}
        pageSize={25}
        isManager
      />
    );
    expect(screen.getByText(/No purchases logged in the last 90 days/)).not.toBeNull();
  });

  it("renders supplier, total, and line items for each receipt", () => {
    render(
      <PurchaseHistoryList
        initialReceipts={[makeReceipt()]}
        page={0}
        totalReceipts={1}
        pageSize={25}
        isManager
      />
    );
    expect(screen.getByText("Acme")).not.toBeNull();
    // Both the receipt total and the single line price are $15.00 — both rendered
    expect(screen.getAllByText("$15.00").length).toBe(2);
    expect(screen.getByText(/Coffee — 2 kg/)).not.toBeNull();
  });
});

describe("PurchaseHistoryList — manager vs staff visibility", () => {
  it("shows attach control to managers when there is no invoice", () => {
    render(
      <PurchaseHistoryList
        initialReceipts={[makeReceipt()]}
        page={0}
        totalReceipts={1}
        pageSize={25}
        isManager
      />
    );
    expect(
      screen.getByLabelText("Attach invoice for Acme receipt")
    ).not.toBeNull();
  });

  it("hides attach/replace/remove from STAFF role", () => {
    render(
      <PurchaseHistoryList
        initialReceipts={[
          makeReceipt({ invoiceImageUrl: "data:image/jpeg;base64,XXX" }),
        ]}
        page={0}
        totalReceipts={1}
        pageSize={25}
        isManager={false}
      />
    );
    expect(screen.queryByLabelText(/Attach invoice/)).toBeNull();
    expect(screen.queryByLabelText(/Replace invoice/)).toBeNull();
    expect(screen.queryByLabelText(/Remove invoice/)).toBeNull();
    // Thumbnail still visible (staff can view)
    expect(screen.getByAltText(/Invoice for Acme/)).not.toBeNull();
  });

  it("shows Replace + Remove on a receipt that already has an invoice (manager only)", () => {
    render(
      <PurchaseHistoryList
        initialReceipts={[
          makeReceipt({ invoiceImageUrl: "data:image/jpeg;base64,XXX" }),
        ]}
        page={0}
        totalReceipts={1}
        pageSize={25}
        isManager
      />
    );
    expect(
      screen.getByLabelText("Replace invoice for Acme receipt")
    ).not.toBeNull();
    expect(
      screen.getByLabelText("Remove invoice from Acme receipt")
    ).not.toBeNull();
  });
});

describe("PurchaseHistoryList — attach flow + optimistic rollback", () => {
  // Stub the FileReader / Image / canvas pipeline used by compressImage.
  // We swap globals (not vi.spyOn) so each test gets a clean replacement that's
  // restored in afterEach without recursion when chained across describe blocks.
  let origImage: typeof Image;
  let origFileReader: typeof FileReader;
  let origCreateElement: typeof document.createElement;

  beforeEach(() => {
    origImage = globalThis.Image;
    origFileReader = globalThis.FileReader;
    origCreateElement = document.createElement.bind(document);

    class StubImage {
      width = 1000;
      height = 500;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    (globalThis as unknown as { Image: typeof StubImage }).Image = StubImage;

    class StubFileReader {
      result: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL(_file: Blob) {
        this.result = "data:image/jpeg;base64,RAW";
        queueMicrotask(() => this.onload?.());
      }
    }
    (globalThis as unknown as { FileReader: typeof StubFileReader }).FileReader = StubFileReader;

    const ctx = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    document.createElement = ((tag: string) => {
      if (tag === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext: () => ctx,
          toDataURL: () => "data:image/jpeg;base64,COMPRESSED",
        } as unknown as HTMLCanvasElement;
      }
      return origCreateElement(tag);
    }) as typeof document.createElement;
  });

  afterEach(() => {
    globalThis.Image = origImage;
    globalThis.FileReader = origFileReader;
    document.createElement = origCreateElement;
  });

  it("calls attachPurchaseInvoice with the compressed dataUrl + correct batchKey", async () => {
    vi.mocked(attachPurchaseInvoice).mockResolvedValue({
      success: true,
      data: { updatedCount: 1 },
    });

    render(
      <PurchaseHistoryList
        initialReceipts={[makeReceipt()]}
        page={0}
        totalReceipts={1}
        pageSize={25}
        isManager
      />
    );

    const fileInput = screen.getByLabelText(
      "Invoice file for Acme receipt"
    ) as HTMLInputElement;
    const file = new File(["x"], "receipt.jpg", { type: "image/jpeg" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(attachPurchaseInvoice).toHaveBeenCalledWith({
        batchKey: "sup-A|user-1|2026-04-29T10:30:00.000Z",
        imageDataUrl: "data:image/jpeg;base64,COMPRESSED",
      });
    });
  });

  it("rolls back the optimistic thumbnail when the action fails and toasts the error", async () => {
    vi.mocked(attachPurchaseInvoice).mockResolvedValue({
      success: false,
      error: "Receipt not found",
    });

    render(
      <PurchaseHistoryList
        initialReceipts={[makeReceipt()]}
        page={0}
        totalReceipts={1}
        pageSize={25}
        isManager
      />
    );

    const fileInput = screen.getByLabelText(
      "Invoice file for Acme receipt"
    ) as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(["x"], "receipt.jpg", { type: "image/jpeg" })] },
    });

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith("Receipt not found");
    });
    // The optimistic thumbnail must be removed; "Attach" copy is back (not "Replace").
    expect(screen.getByLabelText("Attach invoice for Acme receipt")).not.toBeNull();
  });
});

describe("PurchaseHistoryList — detach flow", () => {
  it("calls detachPurchaseInvoice and clears the thumbnail optimistically", async () => {
    vi.mocked(detachPurchaseInvoice).mockResolvedValue({
      success: true,
      data: { updatedCount: 1 },
    });

    render(
      <PurchaseHistoryList
        initialReceipts={[
          makeReceipt({ invoiceImageUrl: "data:image/jpeg;base64,XXX" }),
        ]}
        page={0}
        totalReceipts={1}
        pageSize={25}
        isManager
      />
    );

    fireEvent.click(screen.getByLabelText("Remove invoice from Acme receipt"));

    await waitFor(() => {
      expect(detachPurchaseInvoice).toHaveBeenCalledWith({
        batchKey: "sup-A|user-1|2026-04-29T10:30:00.000Z",
      });
    });
    expect(screen.getByLabelText("Attach invoice for Acme receipt")).not.toBeNull();
  });
});

describe("PurchaseHistoryList — pagination", () => {
  it("renders Previous/Next links and the 'Page N of M' label on multi-page", () => {
    render(
      <PurchaseHistoryList
        initialReceipts={[makeReceipt()]}
        page={1}
        totalReceipts={60}
        pageSize={25}
        isManager
      />
    );
    const prev = screen.getByText(/Previous/) as HTMLAnchorElement;
    const next = screen.getByText(/Next/) as HTMLAnchorElement;
    expect(prev.getAttribute("href")).toBe("/purchases?tab=history&page=0");
    expect(next.getAttribute("href")).toBe("/purchases?tab=history&page=2");
    // Off-by-one regression on the page label would slip through without this.
    expect(screen.getByText("Page 2 of 3")).not.toBeNull();
  });

  it("does not render Previous on page 0", () => {
    render(
      <PurchaseHistoryList
        initialReceipts={[makeReceipt()]}
        page={0}
        totalReceipts={60}
        pageSize={25}
        isManager
      />
    );
    expect(screen.queryByText(/Previous/)).toBeNull();
    expect(screen.getByText(/Next/)).not.toBeNull();
  });

  it("does not render Next on the last page", () => {
    render(
      <PurchaseHistoryList
        initialReceipts={[makeReceipt()]}
        page={2}
        totalReceipts={60}
        pageSize={25}
        isManager
      />
    );
    expect(screen.getByText(/Previous/)).not.toBeNull();
    expect(screen.queryByText(/Next/)).toBeNull();
  });

  it("does not render pagination block when there is only one page", () => {
    const { container } = render(
      <PurchaseHistoryList
        initialReceipts={[makeReceipt()]}
        page={0}
        totalReceipts={1}
        pageSize={25}
        isManager
      />
    );
    expect(container.textContent).not.toContain("Page 1 of");
  });
});
