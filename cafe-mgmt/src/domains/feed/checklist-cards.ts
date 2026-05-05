import { getOrCreateDailyChecklists } from "@/lib/checklist";
import { getCurrentPeriod, getAllPeriods, type TimeBoundaries } from "@/lib/period-detection";
import type { FeedCard, ChecklistCardData } from "@/types/feed";
import type { Role, Period } from "@/generated/prisma/enums";

export async function getChecklistCards(
  cafeId: string,
  role: Role,
  timeBoundaries: TimeBoundaries
): Promise<FeedCard[]> {
  const dailyChecklists = await getOrCreateDailyChecklists(cafeId);

  if (dailyChecklists.length === 0) return [];

  const currentPeriod = getCurrentPeriod(timeBoundaries);
  const allPeriods = getAllPeriods(timeBoundaries);

  const cards: FeedCard[] = [];

  for (const dc of dailyChecklists) {
    // Filter items by role
    const roleItems = dc.items.filter(
      (item) => item.role === null || item.role === role
    );

    if (roleItems.length === 0) continue;

    const completed = roleItems.filter((i) => i.completedAt).length;
    const total = roleItems.length;
    const isComplete = completed === total;
    const isAutoSelected = currentPeriod?.period === dc.period;

    const periodInfo = allPeriods.find((p) => p.period === dc.period);
    const periodLabel = periodInfo?.label ?? dc.period;

    if (isComplete) {
      // Completion summary card
      cards.push({
        id: `checklist-done-${dc.id}`,
        variant: "completion",
        priority: 4, // informational
        title: periodLabel,
        subtitle: `${completed}/${total} items. All on track.`,
        borderColor: "var(--color-success)",
        data: {
          period: dc.period,
          periodLabel,
          dailyChecklistId: dc.id,
          completed,
          total,
          isAutoSelected,
        } satisfies Partial<ChecklistCardData>,
        createdAt: dc.createdAt.toISOString(),
      });
    } else {
      // Active checklist card
      cards.push({
        id: `checklist-${dc.id}`,
        variant: "checklist",
        priority: isAutoSelected ? 2 : 3, // time-sensitive if current period, alert otherwise
        title: periodLabel,
        subtitle: `${completed}/${total} complete`,
        borderColor: isAutoSelected
          ? "var(--color-info)"
          : "var(--border-default)",
        data: {
          period: dc.period,
          periodLabel,
          dailyChecklistId: dc.id,
          items: roleItems.map((item) => ({
            id: item.id,
            text: item.text,
            notes: item.notes,
            role: item.role,
            linkRoute: item.linkRoute,
            completedAt: item.completedAt?.toISOString() ?? null,
            completedByName: item.completedBy?.name ?? null,
          })),
          completed,
          total,
          isAutoSelected,
        } satisfies ChecklistCardData,
        createdAt: dc.createdAt.toISOString(),
      });
    }
  }

  return cards;
}
