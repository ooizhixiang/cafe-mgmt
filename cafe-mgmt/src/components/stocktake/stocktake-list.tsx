"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTransition } from "react";
import { startStocktake, type ActiveStocktakeRow } from "@/actions/stocktake.actions";
import { useToast } from "@/components/ui/toast";

interface Props {
  stocktakes: ActiveStocktakeRow[];
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kuala_Lumpur",
  });
}

export function StocktakeList({ stocktakes }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function handleStart() {
    startTransition(async () => {
      const result = await startStocktake();
      if (!result.success) {
        toast(result.error);
        return;
      }
      router.push(`/stocktake?id=${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-[var(--space-4)]">
        <h2 className="text-body font-semibold">Active sessions</h2>
        <button
          type="button"
          onClick={handleStart}
          disabled={isPending}
          className="rounded bg-[var(--color-info)] text-white px-[var(--space-3)] py-[var(--space-2)] text-meta font-medium disabled:opacity-50"
        >
          {isPending ? "Starting…" : "+ Start Stocktake"}
        </button>
      </div>
      {stocktakes.length === 0 ? (
        <p className="text-meta text-[var(--text-secondary)] text-center py-[var(--space-6)] rounded-lg border border-dashed border-[var(--border-default)]">
          No active stocktakes. Start a new one to begin counting.
        </p>
      ) : (
        <ul className="space-y-[var(--space-2)]">
          {stocktakes.map((s) => (
            <li
              key={s.id}
              className="rounded-lg border border-[var(--border-default)] p-[var(--space-3)]"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <Link
                href={`/stocktake?id=${s.id}`}
                className="flex items-center justify-between gap-[var(--space-3)]"
              >
                <div>
                  <div className="text-body font-medium">
                    Started {formatTime(s.startedAt)}
                  </div>
                  <div className="text-meta text-[var(--text-secondary)]">
                    by {s.startedByName}
                  </div>
                </div>
                <div className="text-meta text-[var(--text-secondary)] whitespace-nowrap">
                  {s.countedItems} / {s.totalItems} counted
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
