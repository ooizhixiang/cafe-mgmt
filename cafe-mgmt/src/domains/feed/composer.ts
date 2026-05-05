import { prisma } from "@/lib/db";
import { getChecklistCards } from "./checklist-cards";
import { getOnboardingFeedCards } from "./onboarding-cards";
import { getAlertCards } from "./alert-cards";
import { getCompWarningCards } from "./comp-warning-cards";
import { getSupplierReminderCards } from "./supplier-reminder-cards";
import { getSinceLastVisitCard } from "./since-last-visit";
import { getMarginAlertCards } from "./margin-alert-cards";
import { getCurrentPeriod, type TimeBoundaries } from "@/lib/period-detection";
import type { FeedResponse, FeedCard, FeedSummary, FeedBadges } from "@/types/feed";
import type { Role } from "@/generated/prisma/enums";

export async function getFeedData(
  cafeId: string,
  role: Role,
  userId: string
): Promise<FeedResponse> {
  // Get cafe config
  const cafe = await prisma.cafe.findUnique({
    where: { id: cafeId },
    select: {
      openingStart: true,
      openingEnd: true,
      midDayStart: true,
      midDayEnd: true,
      closingStart: true,
      closingEnd: true,
    },
  });

  if (!cafe) {
    return { cards: [], summary: {}, badges: { feed: false, inventory: false, wastageComp: false } };
  }

  const timeBoundaries: TimeBoundaries = {
    openingStart: cafe.openingStart,
    openingEnd: cafe.openingEnd,
    midDayStart: cafe.midDayStart,
    midDayEnd: cafe.midDayEnd,
    closingStart: cafe.closingStart,
    closingEnd: cafe.closingEnd,
  };

  // Per-domain error isolation via Promise.allSettled
  const results = await Promise.allSettled([
    getChecklistCards(cafeId, role, timeBoundaries),
    role === "MANAGER"
      ? getOnboardingFeedCards(cafeId)
      : Promise.resolve([]),
    getAlertCards(cafeId),
    getCompWarningCards(cafeId),
    getSupplierReminderCards(cafeId),
    getSinceLastVisitCard(cafeId, userId),
    getMarginAlertCards(cafeId),
  ]);

  const allCards: FeedCard[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      allCards.push(...result.value);
    }
    // Silently ignore failed domains — don't break the whole feed
  }

  // Sort by priority (lower = higher priority), then by creation time
  allCards.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // Build summary
  const summary = buildSummary(allCards, timeBoundaries);

  // Build badges
  const badges = buildBadges(allCards);

  return { cards: allCards, summary, badges };
}

function buildSummary(
  cards: FeedCard[],
  timeBoundaries: TimeBoundaries
): FeedSummary {
  // Find the current period's checklist card for summary
  const currentPeriod = getCurrentPeriod(timeBoundaries);

  if (currentPeriod) {
    const checklistCard = cards.find(
      (c) =>
        (c.variant === "checklist" || c.variant === "completion") &&
        (c.data as Record<string, unknown>).period === currentPeriod.period
    );

    if (checklistCard) {
      const data = checklistCard.data as Record<string, unknown>;
      return {
        checklistProgress: {
          period: currentPeriod.label,
          completed: data.completed as number,
          total: data.total as number,
        },
      };
    }
  }

  // Fallback: use the first incomplete checklist
  const firstChecklist = cards.find((c) => c.variant === "checklist");
  if (firstChecklist) {
    const data = firstChecklist.data as Record<string, unknown>;
    return {
      checklistProgress: {
        period: data.periodLabel as string,
        completed: data.completed as number,
        total: data.total as number,
      },
    };
  }

  return {};
}

function buildBadges(cards: FeedCard[]): FeedBadges {
  const hasIncompleteChecklist = cards.some((c) => c.variant === "checklist");
  const hasLowStockAlert = cards.some(
    (c) => c.variant === "alert" && (c.data as Record<string, unknown>).type === "LOW_STOCK"
  );
  const hasCompWarning = cards.some(
    (c) => c.variant === "alert" && (c.data as Record<string, unknown>).type === "COMP_WARNING"
  );
  return {
    feed: hasIncompleteChecklist || hasLowStockAlert || hasCompWarning,
    inventory: hasLowStockAlert,
    wastageComp: hasCompWarning,
  };
}
