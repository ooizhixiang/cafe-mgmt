import { prisma } from "@/lib/db";
import { getCafeNow } from "@/lib/format";
import type { Period } from "@/generated/prisma/enums";

/**
 * Get or create daily checklists for a given date.
 * On-demand generation — no cron needed.
 * Uses unique constraint (cafeId, date, period) for concurrent safety.
 */
export async function getOrCreateDailyChecklists(cafeId: string) {
  const cafeNow = getCafeNow();
  // Normalize to date only (midnight)
  const today = new Date(
    cafeNow.getFullYear(),
    cafeNow.getMonth(),
    cafeNow.getDate()
  );

  // Check for existing daily checklists
  const existing = await prisma.dailyChecklist.findMany({
    where: { cafeId, date: today },
    include: {
      items: {
        include: { completedBy: { select: { name: true } } },
        orderBy: { displayOrder: "asc" },
      },
    },
    orderBy: { period: "asc" },
  });

  if (existing.length > 0) {
    return existing;
  }

  // Get templates
  const templates = await prisma.checklistTemplate.findMany({
    where: { cafeId },
    include: { items: { orderBy: { displayOrder: "asc" } } },
  });

  if (templates.length === 0) {
    return [];
  }

  // Create daily checklists from templates
  const results = [];

  for (const template of templates) {
    try {
      const daily = await prisma.dailyChecklist.create({
        data: {
          cafeId,
          date: today,
          period: template.period,
          checklistTemplateId: template.id,
          items: {
            create: template.items.map((item) => ({
              checklistTemplateItemId: item.id,
              text: item.text,
              displayOrder: item.displayOrder,
              notes: item.notes,
              role: item.role,
              linkRoute: item.linkRoute,
            })),
          },
        },
        include: {
          items: {
            include: { completedBy: { select: { name: true } } },
            orderBy: { displayOrder: "asc" },
          },
        },
      });
      results.push(daily);
    } catch (error) {
      // Unique constraint violation — another request already created it
      if (
        error instanceof Error &&
        error.message.includes("Unique constraint")
      ) {
        const existingDaily = await prisma.dailyChecklist.findFirst({
          where: { cafeId, date: today, period: template.period },
          include: {
            items: {
              include: { completedBy: { select: { name: true } } },
              orderBy: { displayOrder: "asc" },
            },
          },
        });
        if (existingDaily) results.push(existingDaily);
      } else {
        throw error;
      }
    }
  }

  return results.sort((a, b) => {
    const order: Record<Period, number> = {
      OPENING: 0,
      MID_DAY: 1,
      CLOSING: 2,
    };
    return order[a.period] - order[b.period];
  });
}
