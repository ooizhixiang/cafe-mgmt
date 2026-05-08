"use client";

import { useEffect, useState, useTransition } from "react";
import { getInventoryLog, type InventoryLogEntry } from "@/actions/inventory.actions";
import { useToast } from "@/components/ui/toast";
import { formatCents } from "@/lib/format";

interface Props {
  initialEntries: InventoryLogEntry[];
  initialNextCursor: number | null;
}

// Absolute timestamp formatter — used on the server pass and on client first
// paint so SSR and hydration agree. Locale-formatted short date+time.
function absoluteTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Relative-time formatter — used post-mount on the client only, after the
// `mounted` flag flips. Avoids the SSR/CSR hydration mismatch you'd get from
// running this against `Date.now()` on both passes (server time ≠ client
// time crossed a bucket boundary).
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 45) return "just now";
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  if (diffSec < 7 * 86400) return `${Math.round(diffSec / 86400)}d ago`;
  return absoluteTime(iso);
}

export function InventoryLog({ initialEntries, initialNextCursor }: Props) {
  const [entries, setEntries] = useState<InventoryLogEntry[]>(initialEntries);
  const [nextCursor, setNextCursor] = useState<number | null>(initialNextCursor);
  const [isPending, startTransition] = useTransition();
  // `mounted` flips to true after first client paint. Until then we render the
  // absolute timestamp (matches SSR output exactly); after, we swap to the
  // friendlier relative form.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const { toast } = useToast();

  function handleShowMore() {
    if (nextCursor === null) return;
    const cursor = nextCursor;
    startTransition(async () => {
      const result = await getInventoryLog({ cursor });
      if (!result.success) {
        toast(result.error);
        return;
      }
      setEntries((prev) => [...prev, ...result.data.entries]);
      setNextCursor(result.data.nextCursor);
    });
  }

  return (
    <div>
      <h2 className="text-body font-semibold mb-[var(--space-3)]">
        Inventory Changes
      </h2>
      {entries.length === 0 ? (
        <p className="text-body text-[var(--text-secondary)] text-center py-[var(--space-6)]">
          No inventory changes yet
        </p>
      ) : (
        <ul className="space-y-[var(--space-2)]">
          {entries.map((entry) => {
            const isLoss = entry.kind === "loss";
            const badgeColor = isLoss
              ? "var(--color-urgent)"
              : "var(--color-success)";
            const badgeLabel = isLoss ? "Loss" : "Add";
            return (
              <li
                key={entry.id}
                className="rounded-lg border border-[var(--border-default)] p-[var(--space-3)] flex flex-wrap items-center gap-[var(--space-2)] text-meta"
              >
                <span
                  className="inline-block rounded px-2 py-0.5 text-meta font-medium text-white"
                  style={{ backgroundColor: badgeColor }}
                >
                  {badgeLabel}
                </span>
                <span className="font-medium">{entry.ingredientName}</span>
                <span className="text-[var(--text-secondary)]">
                  · {entry.quantity} {entry.ingredientUnit}
                </span>
                <span className="text-[var(--text-secondary)]">
                  · {formatCents(entry.dollarValueInCents)}
                </span>
                {entry.description && (
                  <span className="text-[var(--text-secondary)]">
                    · {entry.description}
                  </span>
                )}
                <span className="text-[var(--text-secondary)] ml-auto">
                  {mounted ? relativeTime(entry.createdAt) : absoluteTime(entry.createdAt)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {nextCursor !== null && (
        <div className="mt-[var(--space-3)] flex justify-center">
          <button
            type="button"
            onClick={handleShowMore}
            disabled={isPending}
            className="text-meta text-[var(--color-info)] font-medium disabled:opacity-50"
          >
            {isPending ? "Loading…" : "Show more"}
          </button>
        </div>
      )}
    </div>
  );
}
