import { prisma } from "@/lib/db";
import { getIncompleteSteps } from "@/lib/onboarding";
import type { FeedCard } from "@/types/feed";

export async function getOnboardingFeedCards(
  cafeId: string
): Promise<FeedCard[]> {
  const cafe = await prisma.cafe.findUnique({
    where: { id: cafeId },
    select: {
      templateSelected: true,
      onboardingCompletedSteps: true,
    },
  });

  if (!cafe?.templateSelected) return [];

  const [staffCount, checklistCount] = await Promise.all([
    prisma.user.count({ where: { cafeId } }),
    prisma.checklistTemplate.count({ where: { cafeId } }),
  ]);

  const steps = getIncompleteSteps({
    onboardingCompletedSteps: cafe.onboardingCompletedSteps,
    ingredientCount: 0,
    staffCount,
    hasCustomizedChecklists: checklistCount > 3,
  });

  return steps.map((step) => ({
    id: `onboarding-${step.key}`,
    variant: "onboarding" as const,
    priority: 4 as const,
    title: step.title,
    subtitle: step.description,
    borderColor: "var(--color-info)",
    data: { key: step.key, linkRoute: step.linkRoute },
    createdAt: new Date().toISOString(),
  }));
}
