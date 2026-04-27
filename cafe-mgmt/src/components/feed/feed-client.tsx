"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { OfflineBanner } from "@/components/ui/offline-banner";
import { SummaryBar } from "@/components/ui/summary-bar";
import { ChecklistCard } from "@/components/feed/checklist-card";
import { OnboardingCard } from "@/components/feed/onboarding-card";
import { ActionFeedCard } from "@/components/ui/action-feed-card";
import { EmptyState } from "@/components/ui/empty-state";
import type { FeedResponse, FeedCard } from "@/types/feed";
import type { OnboardingStep } from "@/lib/onboarding";

const FEED_REFRESH_INTERVAL_MS = 30_000;
const CACHE_KEY = "cafe-feed-cache";

function SkeletonCard() {
  return (
    <div className="rounded-lg p-[var(--space-4)]" style={{ boxShadow: "var(--shadow-card)" }}>
      <div className="h-4 w-1/3 rounded-lg mb-[var(--space-3)] animate-shimmer" />
      <div className="h-3 w-2/3 rounded-lg mb-[var(--space-2)] animate-shimmer" />
      <div className="h-3 w-1/2 rounded-lg animate-shimmer" />
    </div>
  );
}

export function FeedClient() {
  const [data, setData] = useState<FeedResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const fetchFeed = useCallback(async () => {
    try {
      const res = await fetch("/api/feed");
      if (!res.ok) throw new Error("Failed to load feed");
      const json: FeedResponse = await res.json();
      setData(json);
      setError(null);
      // Cache for offline
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(json));
      } catch {}
    } catch {
      // Try cached data
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          setData(JSON.parse(cached));
        }
      } catch {}
      setError("Could not load feed");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeed();

    const interval = setInterval(fetchFeed, FEED_REFRESH_INTERVAL_MS);

    const handleFocus = () => fetchFeed();
    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [fetchFeed]);

  // Pull to refresh via touch
  useEffect(() => {
    let startY = 0;
    let pulling = false;

    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        startY = e.touches[0].clientY;
        pulling = true;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (pulling) {
        const endY = e.changedTouches[0].clientY;
        if (endY - startY > 80) {
          fetchFeed();
        }
        pulling = false;
      }
    };

    document.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [fetchFeed]);

  if (isLoading) {
    return (
      <div className="space-y-[var(--space-3)]">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!data || data.cards.length === 0) {
    return <EmptyState variant="all-caught-up" />;
  }

  return (
    <>
      <OfflineBanner />
      <SummaryBar summary={data.summary} />
      <div className="space-y-[var(--space-3)] lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
        {data.cards.map((card) => renderCard(card))}
      </div>
    </>
  );
}

function renderCard(card: FeedCard) {
  switch (card.variant) {
    case "checklist":
      return <ChecklistCard key={card.id} card={card} />;
    case "onboarding":
      return (
        <OnboardingCard
          key={card.id}
          step={{
            key: (card.data as Record<string, string>).key,
            title: card.title,
            description: card.subtitle ?? "",
            linkRoute: (card.data as Record<string, string>).linkRoute,
            priority: card.priority,
          }}
        />
      );
    case "completion":
      return (
        <ActionFeedCard key={card.id} card={card} />
      );
    case "summary":
      return (
        <ActionFeedCard key={card.id} card={card} />
      );
    default:
      return <ActionFeedCard key={card.id} card={card} />;
  }
}
