"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toggleChecklistItem } from "@/actions/checklist.actions";
import { ActionFeedCard } from "@/components/ui/action-feed-card";
import { Check } from "lucide-react";
import type { FeedCard, ChecklistCardData, ChecklistItemData } from "@/types/feed";

const MAX_VISIBLE_ITEMS = 4;

export function ChecklistCard({ card }: { card: FeedCard }) {
  const data = card.data as unknown as ChecklistCardData;
  const [items, setItems] = useState(data.items);
  const [showAll, setShowAll] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const visibleItems = showAll ? items : items.slice(0, MAX_VISIBLE_ITEMS);
  const hiddenCount = items.length - MAX_VISIBLE_ITEMS;
  const completed = items.filter((i) => i.completedAt).length;

  function handleToggle(item: ChecklistItemData) {
    // Optimistic update
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? {
              ...i,
              completedAt: i.completedAt ? null : new Date().toISOString(),
            }
          : i
      )
    );

    startTransition(async () => {
      const result = await toggleChecklistItem(item.id);
      if (!result.success) {
        // Rollback
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, completedAt: item.completedAt }
              : i
          )
        );
      } else {
        router.refresh();
      }
    });
  }

  return (
    <ActionFeedCard card={{ ...card, subtitle: `${completed}/${data.total} complete` }}>
      {/* Progress bar */}
      <div className="w-full h-1.5 bg-[var(--bg-secondary)] rounded-full overflow-hidden mt-[var(--space-3)]">
        <div
          className="h-full bg-[var(--color-info)] rounded-full transition-all duration-200"
          style={{
            width: `${data.total > 0 ? (completed / data.total) * 100 : 0}%`,
          }}
        />
      </div>

      {/* Items */}
      <div className="mt-[var(--space-3)] space-y-[var(--space-1)]">
        {visibleItems.map((item) => (
          <button
            key={item.id}
            onClick={() => handleToggle(item)}
            disabled={isPending}
            className="flex items-center gap-[var(--space-2)] w-full text-left touch-target py-1 group"
          >
            <div
              className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-100 ${
                item.completedAt
                  ? "bg-[var(--color-success)] border-[var(--color-success)]"
                  : "border-[var(--border-default)] group-hover:border-[var(--color-info)]"
              }`}
            >
              {item.completedAt && (
                <Check size={12} className="text-white" strokeWidth={3} />
              )}
            </div>
            <span
              className={`text-meta flex-1 ${
                item.completedAt
                  ? "line-through text-[var(--text-secondary)]"
                  : ""
              }`}
            >
              {item.text}
            </span>
            {item.linkRoute && (
              <Link
                href={item.linkRoute}
                onClick={(e) => e.stopPropagation()}
                className="text-meta text-[var(--color-info)] shrink-0"
              >
                View →
              </Link>
            )}
          </button>
        ))}
      </div>

      {!showAll && hiddenCount > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="text-meta text-[var(--color-info)] mt-[var(--space-2)]"
        >
          Show all {items.length} items
        </button>
      )}
    </ActionFeedCard>
  );
}
