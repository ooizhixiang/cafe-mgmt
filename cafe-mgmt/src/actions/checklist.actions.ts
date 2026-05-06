"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, requireAuth } from "@/lib/auth";
import { logError } from "@/lib/log-error";
import { getOrCreateDailyChecklists } from "@/lib/checklist";
import { getCafeToday } from "@/lib/format";
import type { ActionResult } from "@/types";

// --- Template Management (Story 2.2) ---

export async function getChecklistTemplates(): Promise<
  ActionResult<
    Array<{
      id: string;
      name: string;
      period: string;
      items: Array<{
        id: string;
        text: string;
        displayOrder: number;
        notes: string | null;
        role: string | null;
        linkRoute: string | null;
      }>;
    }>
  >
> {
  try {
    const session = await requireAuth();
    const cafeId = session.user.cafeId;

    const templates = await prisma.checklistTemplate.findMany({
      where: { cafeId },
      include: {
        items: { orderBy: { displayOrder: "asc" } },
      },
      orderBy: { period: "asc" },
    });

    return { success: true, data: templates };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthenticated") {
      return { success: false, error: "Unauthenticated" };
    }
    return { success: false, error: "Something went wrong. Please try again." };
  }
}

const addItemSchema = z.object({
  templateId: z.string().min(1),
  text: z.string().min(1, "Item text is required").max(200),
  notes: z.string().max(500).optional(),
  role: z.enum(["MANAGER", "STAFF"]).nullable().optional(),
});

export async function addChecklistItem(
  templateId: string,
  text: string,
  notes?: string,
  role?: "MANAGER" | "STAFF" | null
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;

    const parsed = addItemSchema.safeParse({ templateId, text, notes, role });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    // Verify template belongs to cafe
    const template = await prisma.checklistTemplate.findUnique({
      where: { id: templateId },
      select: { cafeId: true },
    });

    if (!template || template.cafeId !== cafeId) {
      return { success: false, error: "Template not found" };
    }

    // Get next display order
    const maxOrder = await prisma.checklistTemplateItem.findFirst({
      where: { checklistTemplateId: templateId },
      orderBy: { displayOrder: "desc" },
      select: { displayOrder: true },
    });

    const item = await prisma.checklistTemplateItem.create({
      data: {
        text: parsed.data.text,
        notes: parsed.data.notes || null,
        role: parsed.data.role ?? null,
        displayOrder: (maxOrder?.displayOrder ?? -1) + 1,
        checklistTemplateId: templateId,
      },
    });

    return { success: true, data: { id: item.id } };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    const message = error instanceof Error ? error.message : "Failed to add item";
    await logError({ context: "addChecklistItem", message });
    return { success: false, error: "Something went wrong. Please try again." };
  }
}

const updateItemSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1, "Item text is required").max(200),
  notes: z.string().max(500).optional(),
  role: z.enum(["MANAGER", "STAFF"]).nullable().optional(),
});

export async function updateChecklistItem(
  id: string,
  text: string,
  notes?: string,
  role?: "MANAGER" | "STAFF" | null
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;

    const parsed = updateItemSchema.safeParse({ id, text, notes, role });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    // Verify item belongs to cafe
    const item = await prisma.checklistTemplateItem.findUnique({
      where: { id },
      include: { template: { select: { cafeId: true } } },
    });

    if (!item || item.template.cafeId !== cafeId) {
      return { success: false, error: "Item not found" };
    }

    await prisma.checklistTemplateItem.update({
      where: { id },
      data: {
        text: parsed.data.text,
        notes: parsed.data.notes ?? null,
        role: parsed.data.role ?? null,
      },
    });

    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    const message = error instanceof Error ? error.message : "Failed to update item";
    await logError({ context: "updateChecklistItem", message });
    return { success: false, error: "Something went wrong. Please try again." };
  }
}

export async function deleteChecklistItem(
  id: string
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;

    const item = await prisma.checklistTemplateItem.findUnique({
      where: { id },
      include: { template: { select: { cafeId: true } } },
    });

    if (!item || item.template.cafeId !== cafeId) {
      return { success: false, error: "Item not found" };
    }

    await prisma.checklistTemplateItem.delete({ where: { id } });

    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    const message = error instanceof Error ? error.message : "Failed to delete item";
    await logError({ context: "deleteChecklistItem", message });
    return { success: false, error: "Something went wrong. Please try again." };
  }
}

export async function reorderChecklistItems(
  items: Array<{ id: string; displayOrder: number }>
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;

    // Verify all items belong to cafe
    const dbItems = await prisma.checklistTemplateItem.findMany({
      where: { id: { in: items.map((i) => i.id) } },
      include: { template: { select: { cafeId: true } } },
    });

    if (dbItems.some((i) => i.template.cafeId !== cafeId)) {
      return { success: false, error: "Unauthorized" };
    }

    await prisma.$transaction(
      items.map((item) =>
        prisma.checklistTemplateItem.update({
          where: { id: item.id },
          data: { displayOrder: item.displayOrder },
        })
      )
    );

    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    const message = error instanceof Error ? error.message : "Failed to reorder";
    await logError({ context: "reorderChecklistItems", message });
    return { success: false, error: "Something went wrong. Please try again." };
  }
}

// --- Daily Checklist Completion (Story 2.3) ---

export async function getDailyChecklists(): Promise<
  ActionResult<
    Array<{
      id: string;
      period: string;
      items: Array<{
        id: string;
        text: string;
        notes: string | null;
        role: string | null;
        linkRoute: string | null;
        completedAt: string | null;
        completedByName: string | null;
      }>;
    }>
  >
> {
  try {
    const session = await requireAuth();
    const cafeId = session.user.cafeId;

    const dailyChecklists = await getOrCreateDailyChecklists(cafeId);

    const data = dailyChecklists.map((dc) => ({
      id: dc.id,
      period: dc.period,
      items: dc.items.map((item) => ({
        id: item.id,
        text: item.text,
        notes: item.notes,
        role: item.role,
        linkRoute: item.linkRoute,
        completedAt: item.completedAt?.toISOString() ?? null,
        completedByName: item.completedBy?.name ?? null,
      })),
    }));

    return { success: true, data };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthenticated") {
      return { success: false, error: "Unauthenticated" };
    }
    const message = error instanceof Error ? error.message : "Failed to get checklists";
    await logError({ context: "getDailyChecklists", message });
    return { success: false, error: "Something went wrong. Please try again." };
  }
}

export async function toggleChecklistItem(
  itemId: string
): Promise<ActionResult<void>> {
  try {
    const session = await requireAuth();
    const cafeId = session.user.cafeId;

    // Verify item belongs to cafe
    const item = await prisma.dailyChecklistItem.findUnique({
      where: { id: itemId },
      include: {
        dailyChecklist: { select: { cafeId: true } },
      },
    });

    if (!item || item.dailyChecklist.cafeId !== cafeId) {
      return { success: false, error: "Item not found" };
    }

    if (item.completedAt) {
      // Undo completion
      await prisma.dailyChecklistItem.update({
        where: { id: itemId },
        data: { completedAt: null, completedById: null },
      });
    } else {
      // Mark complete
      await prisma.dailyChecklistItem.update({
        where: { id: itemId },
        data: { completedAt: new Date(), completedById: session.user.id },
      });
    }

    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthenticated") {
      return { success: false, error: "Unauthenticated" };
    }
    const message = error instanceof Error ? error.message : "Failed to toggle item";
    await logError({ context: "toggleChecklistItem", message });
    return { success: false, error: "Something went wrong. Please try again." };
  }
}

// --- History & Activity (Story 2.5) ---

export async function getChecklistHistory(
  days: number = 30
): Promise<
  ActionResult<
    Array<{
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
    }>
  >
> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;

    // Lower bound built off today's KL calendar date as a UTC-midnight Date
    // so it matches the `@db.Date` shape Prisma uses for DailyChecklist.date.
    const since = getCafeToday();
    since.setUTCDate(since.getUTCDate() - days);

    const checklists = await prisma.dailyChecklist.findMany({
      where: {
        cafeId,
        date: { gte: since },
      },
      include: {
        template: { select: { name: true } },
        items: {
          include: { completedBy: { select: { name: true } } },
          orderBy: { displayOrder: "asc" },
        },
      },
      orderBy: [{ date: "desc" }, { period: "asc" }],
    });

    const data = checklists.map((cl) => ({
      date: cl.date.toISOString().split("T")[0],
      period: cl.period,
      templateName: cl.template.name,
      items: cl.items.map((item) => ({
        text: item.text,
        completedAt: item.completedAt?.toISOString() ?? null,
        completedByName: item.completedBy?.name ?? null,
      })),
      completed: cl.items.filter((i) => i.completedAt).length,
      total: cl.items.length,
    }));

    return { success: true, data };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    const message = error instanceof Error ? error.message : "Failed to get history";
    await logError({ context: "getChecklistHistory", message });
    return { success: false, error: "Something went wrong. Please try again." };
  }
}

export async function getMyActivity(): Promise<
  ActionResult<
    Array<{
      text: string;
      period: string;
      completedAt: string;
    }>
  >
> {
  try {
    const session = await requireAuth();

    // Get today's start in cafe timezone
    const { getCafeNow } = await import("@/lib/format");
    const cafeNow = getCafeNow();
    const todayStart = new Date(
      cafeNow.getFullYear(),
      cafeNow.getMonth(),
      cafeNow.getDate()
    );

    const items = await prisma.dailyChecklistItem.findMany({
      where: {
        completedById: session.user.id,
        completedAt: { gte: todayStart },
      },
      include: {
        dailyChecklist: { select: { period: true } },
      },
      orderBy: { completedAt: "desc" },
    });

    const data = items.map((item) => ({
      text: item.text,
      period: item.dailyChecklist.period,
      completedAt: item.completedAt!.toISOString(),
    }));

    return { success: true, data };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthenticated") {
      return { success: false, error: "Unauthenticated" };
    }
    return { success: false, error: "Something went wrong. Please try again." };
  }
}
