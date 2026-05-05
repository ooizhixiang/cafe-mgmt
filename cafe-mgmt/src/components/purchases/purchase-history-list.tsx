"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Image as ImageIcon, RefreshCw, Trash2 } from "lucide-react";
import {
  attachPurchaseInvoice,
  detachPurchaseInvoice,
} from "@/actions/inventory.actions";
import { useToast } from "@/components/ui/toast";
import { formatCents } from "@/lib/format";

// Serializable shape passed from the server (Date → ISO strings).
export interface SerializableLine {
  id: string;
  ingredientId: string;
  ingredientName: string;
  supplierName: string;
  quantity: number;
  unit: string;
  totalPriceInCents: number;
  createdAt: string;
}

export interface SerializableReceipt {
  batchKey: string;
  supplierId: string;
  supplierName: string;
  createdById: string;
  createdByName: string | null;
  minuteStart: string;
  totalInCents: number;
  invoiceImageUrl: string | null;
  lines: SerializableLine[];
}

interface Props {
  initialReceipts: SerializableReceipt[];
  page: number;
  totalReceipts: number;
  pageSize: number;
  isManager: boolean;
}

// Local copy of the project's shared image-compression helper. Two other
// callers (grab-and-go-list, recipe-editor) carry their own; the spec
// explicitly defers extracting a shared helper to a focused refactor.
function compressImage(file: File, maxSize = 800): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height / width) * maxSize;
            width = maxSize;
          } else {
            width = (width / height) * maxSize;
            height = maxSize;
          }
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatReceiptTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PurchaseHistoryList({
  initialReceipts,
  page,
  totalReceipts,
  pageSize,
  isManager,
}: Props) {
  const [receipts, setReceipts] = useState(initialReceipts);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  // Per-row file-input refs so each receipt's "Attach"/"Replace" button can
  // open its own native picker.
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  if (receipts.length === 0) {
    return (
      <p className="text-body text-[var(--text-secondary)] mt-[var(--space-6)]">
        No purchases logged in the last 90 days.
      </p>
    );
  }

  function setReceiptInvoice(batchKey: string, url: string | null) {
    setReceipts((prev) =>
      prev.map((r) => (r.batchKey === batchKey ? { ...r, invoiceImageUrl: url } : r))
    );
  }

  async function handleFile(batchKey: string, file: File) {
    const previousUrl =
      receipts.find((r) => r.batchKey === batchKey)?.invoiceImageUrl ?? null;
    let dataUrl: string;
    try {
      dataUrl = await compressImage(file);
    } catch {
      toast("Could not read image");
      return;
    }
    setReceiptInvoice(batchKey, dataUrl);
    startTransition(async () => {
      const result = await attachPurchaseInvoice({ batchKey, imageDataUrl: dataUrl });
      if (!result.success) {
        toast(result.error);
        setReceiptInvoice(batchKey, previousUrl);
      }
    });
  }

  function handleDetach(batchKey: string) {
    const previousUrl =
      receipts.find((r) => r.batchKey === batchKey)?.invoiceImageUrl ?? null;
    setReceiptInvoice(batchKey, null);
    startTransition(async () => {
      const result = await detachPurchaseInvoice({ batchKey });
      if (!result.success) {
        toast(result.error);
        setReceiptInvoice(batchKey, previousUrl);
      }
    });
  }

  const lastPage = Math.max(0, Math.ceil(totalReceipts / pageSize) - 1);
  const hasPrev = page > 0;
  const hasNext = page < lastPage;

  return (
    <div className="mt-[var(--space-4)] space-y-[var(--space-4)]">
      <ul className="space-y-[var(--space-3)]">
        {receipts.map((receipt) => (
          <li
            key={receipt.batchKey}
            className="rounded-lg border border-[var(--border-default)] p-[var(--space-4)]"
          >
            <div className="flex items-start justify-between mb-[var(--space-2)]">
              <div>
                <p className="text-body font-semibold">{receipt.supplierName}</p>
                <p className="text-meta text-[var(--text-secondary)]">
                  {formatReceiptTimestamp(receipt.minuteStart)}
                  {receipt.createdByName ? ` · ${receipt.createdByName}` : ""}
                </p>
              </div>
              <p className="text-body font-medium">{formatCents(receipt.totalInCents)}</p>
            </div>

            <ul className="space-y-1 mb-[var(--space-3)]">
              {receipt.lines.map((line) => (
                <li
                  key={line.id}
                  className="flex justify-between text-meta border-l-2 border-[var(--border-default)] pl-[var(--space-3)] py-1"
                >
                  <span>
                    {line.ingredientName} — {line.quantity} {line.unit}
                  </span>
                  <span className="text-[var(--text-secondary)]">
                    {formatCents(line.totalPriceInCents)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex items-center gap-[var(--space-3)]">
              {receipt.invoiceImageUrl ? (
                // Render as <img> only — do NOT wrap in <a href={dataUrl}>.
                // Anchor navigation to data: URLs is a known XSS vector
                // (SVG / HTML payloads sniffed despite "image/*" prefix). The
                // <img> tag enforces image-content-type rendering by spec.
                <img
                  src={receipt.invoiceImageUrl}
                  alt={`Invoice for ${receipt.supplierName} on ${formatReceiptTimestamp(receipt.minuteStart)}`}
                  className="h-16 w-16 rounded border border-[var(--border-default)] object-cover"
                />
              ) : (
                <span className="text-meta text-[var(--text-secondary)] flex items-center gap-1">
                  <ImageIcon size={14} />
                  No invoice
                </span>
              )}

              {isManager && (
                <>
                  <input
                    ref={(el) => {
                      fileInputs.current[receipt.batchKey] = el;
                    }}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    aria-label={`Invoice file for ${receipt.supplierName} receipt`}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFile(receipt.batchKey, file);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputs.current[receipt.batchKey]?.click()}
                    disabled={isPending}
                    className="text-meta text-[var(--color-info)] font-medium disabled:opacity-50"
                    aria-label={
                      receipt.invoiceImageUrl
                        ? `Replace invoice for ${receipt.supplierName} receipt`
                        : `Attach invoice for ${receipt.supplierName} receipt`
                    }
                  >
                    {receipt.invoiceImageUrl ? (
                      <>
                        <RefreshCw size={14} className="inline" /> Replace
                      </>
                    ) : (
                      <>
                        <ImageIcon size={14} className="inline" /> Attach invoice
                      </>
                    )}
                  </button>
                  {receipt.invoiceImageUrl && (
                    <button
                      type="button"
                      onClick={() => handleDetach(receipt.batchKey)}
                      disabled={isPending}
                      aria-label={`Remove invoice from ${receipt.supplierName} receipt`}
                      className="text-meta text-[var(--color-urgent)] font-medium disabled:opacity-50"
                    >
                      <Trash2 size={14} className="inline" /> Remove
                    </button>
                  )}
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      {(hasPrev || hasNext) && (
        <div className="flex justify-between text-meta">
          {hasPrev ? (
            <Link
              href={`/purchases?tab=history&page=${page - 1}`}
              className="text-[var(--color-info)] font-medium"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-[var(--text-secondary)]">
            Page {page + 1} of {lastPage + 1}
          </span>
          {hasNext ? (
            <Link
              href={`/purchases?tab=history&page=${page + 1}`}
              className="text-[var(--color-info)] font-medium"
            >
              Next →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
