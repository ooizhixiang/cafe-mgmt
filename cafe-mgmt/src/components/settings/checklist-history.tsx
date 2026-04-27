"use client";

import { formatTime } from "@/lib/format";

interface HistoryEntry {
  date: string;
  period: string;
  templateName: string;
  items: Array<{
    text: string;
    completedAt: string | null;
    completedByName: string | null;
  }>;
  completed: number;
  total: number;
}

export function ChecklistHistory({
  history,
}: {
  history: HistoryEntry[];
}) {
  if (history.length === 0) {
    return (
      <p className="text-body text-[var(--text-secondary)]">
        No checklist history yet.
      </p>
    );
  }

  // Group by date
  const grouped = new Map<string, HistoryEntry[]>();
  for (const entry of history) {
    const existing = grouped.get(entry.date) ?? [];
    existing.push(entry);
    grouped.set(entry.date, existing);
  }

  return (
    <div className="space-y-[var(--space-6)]">
      {Array.from(grouped.entries()).map(([date, entries]) => (
        <div key={date}>
          <h3 className="text-value mb-[var(--space-3)]">
            {new Date(date + "T00:00:00").toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </h3>
          <div className="space-y-[var(--space-3)]">
            {entries.map((entry, idx) => {
              const isComplete = entry.completed === entry.total;
              const lastCompleter = entry.items
                .filter((i) => i.completedAt)
                .sort(
                  (a, b) =>
                    new Date(b.completedAt!).getTime() -
                    new Date(a.completedAt!).getTime()
                )[0];

              return (
                <div
                  key={idx}
                  className={`rounded-lg border p-[var(--space-3)] ${
                    isComplete
                      ? "border-[var(--color-success)]/30 bg-[var(--color-success)]/5"
                      : "border-[var(--border-default)]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-body font-medium">
                      {entry.templateName}
                    </span>
                    <span
                      className={`text-meta font-medium ${
                        isComplete
                          ? "text-[var(--color-success)]"
                          : "text-[var(--text-secondary)]"
                      }`}
                    >
                      {entry.completed}/{entry.total}
                    </span>
                  </div>
                  {isComplete && lastCompleter && (
                    <p className="text-meta text-[var(--text-secondary)] mt-1">
                      {isComplete ? "Complete" : "Incomplete"}.{" "}
                      {entry.completed}/{entry.total} items
                      {lastCompleter.completedByName &&
                        ` by ${lastCompleter.completedByName}`}
                      {lastCompleter.completedAt &&
                        ` at ${formatTime(new Date(lastCompleter.completedAt))}`}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
