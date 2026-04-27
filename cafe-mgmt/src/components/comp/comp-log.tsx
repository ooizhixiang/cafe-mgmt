"use client";

import { useState, useEffect, useTransition } from "react";
import { getCompLog, flagCompForReview, dismissFlag, voidComp } from "@/actions/comp.actions";
import { formatCents, formatDateTime } from "@/lib/format";
import { useToast } from "@/components/ui/toast";

interface CompEntry {
  id: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  reason: string;
  dollarValueInCents: number;
  createdByName: string;
  createdAt: string;
  flaggedForReview: boolean;
  voidedAt: string | null;
}

export function CompLog({ isManager }: { isManager: boolean }) {
  const [entries, setEntries] = useState<CompEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  useEffect(() => {
    loadEntries();

    function handleUpdate() { loadEntries(); }
    window.addEventListener("comp-updated", handleUpdate);
    return () => window.removeEventListener("comp-updated", handleUpdate);
  }, []);

  async function loadEntries() {
    setLoading(true);
    const result = await getCompLog();
    if (result.success && result.data) {
      setEntries(result.data);
    }
    setLoading(false);
  }

  function handleFlag(id: string) {
    startTransition(async () => {
      const result = await flagCompForReview(id);
      if (result.success) {
        toast("Flagged for review");
        loadEntries();
      }
    });
  }

  function handleDismissFlag(id: string) {
    startTransition(async () => {
      const result = await dismissFlag(id);
      if (result.success) {
        toast("Flag dismissed");
        loadEntries();
      }
    });
  }

  function handleVoid(id: string) {
    if (!confirm("Void this comp entry?")) return;
    startTransition(async () => {
      const result = await voidComp(id);
      if (!result.success) {
        toast(result.error);
        return;
      }
      toast("Complimentary voided");
      loadEntries();
    });
  }

  if (loading) {
    return <div className="p-[var(--space-4)] text-meta text-[var(--text-secondary)]">Loading...</div>;
  }

  if (entries.length === 0) {
    return (
      <p className="text-body text-[var(--text-secondary)] text-center py-[var(--space-4)]">
        No comp entries yet
      </p>
    );
  }

  return (
    <div className="space-y-[var(--space-1)]">
      {entries.map((entry) => {
        const isVoided = entry.voidedAt !== null;

        return (
          <div
            key={entry.id}
            className={`flex items-center justify-between rounded-lg border px-[var(--space-3)] py-[var(--space-2)] ${
              entry.flaggedForReview
                ? "border-[var(--color-warning)] bg-[var(--color-warning)]/5"
                : "border-[var(--border-default)]"
            } ${isVoided ? "opacity-50" : ""}`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-[var(--space-2)]">
                <span className={`text-body ${isVoided ? "line-through" : ""}`}>
                  {entry.ingredientName}
                </span>
                {entry.flaggedForReview && (
                  <span className="text-meta text-[var(--color-warning)] font-medium">
                    Flagged
                  </span>
                )}
              </div>
              <p className="text-meta text-[var(--text-secondary)]">{entry.reason}</p>
              <p className="text-meta text-[var(--text-secondary)]">
                {entry.createdByName} · {formatDateTime(new Date(entry.createdAt))}
              </p>
            </div>

            <div className="text-right shrink-0 ml-[var(--space-2)]">
              <p className={`text-body font-semibold ${isVoided ? "line-through" : "text-[var(--color-info)]"}`}>
                -{formatCents(entry.dollarValueInCents)}
              </p>
              <p className="text-meta text-[var(--text-secondary)]">
                {entry.quantity} {entry.unit}
              </p>
            </div>

            {!isVoided && (
              <div className="flex flex-col gap-1 ml-[var(--space-2)]">
                {!isManager && !entry.flaggedForReview && (
                  <button
                    onClick={() => handleFlag(entry.id)}
                    disabled={isPending}
                    className="text-meta text-[var(--color-warning)] font-medium"
                  >
                    Flag
                  </button>
                )}
                {isManager && entry.flaggedForReview && (
                  <button
                    onClick={() => handleDismissFlag(entry.id)}
                    disabled={isPending}
                    className="text-meta text-[var(--color-info)] font-medium"
                  >
                    Dismiss
                  </button>
                )}
                {isManager && (
                  <button
                    onClick={() => handleVoid(entry.id)}
                    disabled={isPending}
                    className="text-meta text-[var(--color-urgent,#dc2626)] font-medium"
                  >
                    Void
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
