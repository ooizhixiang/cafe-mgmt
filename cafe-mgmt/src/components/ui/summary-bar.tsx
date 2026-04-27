"use client";

import type { FeedSummary } from "@/types/feed";

export function SummaryBar({ summary }: { summary: FeedSummary }) {
  if (!summary.checklistProgress && summary.compBudgetRemaining === undefined) {
    return null;
  }

  return (
    <div
      className="sticky top-0 z-10 border-b border-[var(--border-default)] px-[var(--space-4)] py-[var(--space-3)] mb-[var(--space-4)]"
      style={{
        backgroundColor: "color-mix(in srgb, var(--bg-primary) 85%, transparent)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div className="flex items-center gap-[var(--space-4)]">
        {summary.checklistProgress && (
          <div className="flex items-center gap-[var(--space-2)]">
            <span className="text-meta font-medium">
              {summary.checklistProgress.period}:
            </span>
            <span className="text-meta text-[var(--text-secondary)]">
              {summary.checklistProgress.completed}/
              {summary.checklistProgress.total}
            </span>
            <div className="w-16 h-1.5 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--color-info)] rounded-full transition-all"
                style={{
                  width: `${
                    summary.checklistProgress.total > 0
                      ? (summary.checklistProgress.completed /
                          summary.checklistProgress.total) *
                        100
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
