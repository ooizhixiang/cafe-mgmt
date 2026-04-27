"use client";

import { ActionFeedCard } from "@/components/ui/action-feed-card";
import type { FeedCard } from "@/types/feed";

interface SummaryData {
  checklistsCompleted: number;
  checklistsTotal: number;
  itemsDone: number;
  itemsTotal: number;
}

export function OperationsSummaryCard({
  card,
  summaryData,
}: {
  card: FeedCard;
  summaryData: SummaryData;
}) {
  return (
    <ActionFeedCard card={card}>
      <div className="mt-[var(--space-3)] space-y-[var(--space-2)]">
        <div className="flex justify-between text-meta">
          <span className="text-[var(--text-secondary)]">Checklists</span>
          <span className="font-medium">
            {summaryData.checklistsCompleted}/{summaryData.checklistsTotal}{" "}
            complete
          </span>
        </div>
        <div className="flex justify-between text-meta">
          <span className="text-[var(--text-secondary)]">Items done</span>
          <span className="font-medium">
            {summaryData.itemsDone}/{summaryData.itemsTotal}
          </span>
        </div>
      </div>
    </ActionFeedCard>
  );
}
