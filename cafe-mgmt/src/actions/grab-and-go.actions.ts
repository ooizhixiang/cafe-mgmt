"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import type { ActionResult } from "@/types";

const createItemSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  priceInCents: z.number().int().min(0).optional(),
  imageUrl: z.string().optional(),
});

export async function getGrabAndGoItems(): Promise<
  ActionResult<Array<{ id: string; name: string; imageUrl: string | null; priceInCents: number; stockCount: number; isActive: boolean }>>
> {
  try {
    const session = await requireAuth();
    const items = await prisma.grabAndGoItem.findMany({
      where: { cafeId: session.user.cafeId },
      orderBy: { createdAt: "asc" },
    });
    return {
      success: true,
      data: items.map((i) => ({
        id: i.id,
        name: i.name,
        imageUrl: i.imageUrl,
        priceInCents: i.priceInCents,
        stockCount: i.stockCount,
        isActive: i.isActive,
      })),
    };
  } catch {
    return { success: false, error: "Failed to load items" };
  }
}

export async function createGrabAndGoItem(
  input: z.infer<typeof createItemSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireRole("MANAGER");
    const parsed = createItemSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

    const item = await prisma.grabAndGoItem.create({
      data: {
        cafeId: session.user.cafeId,
        name: parsed.data.name,
        priceInCents: parsed.data.priceInCents ?? 0,
        imageUrl: parsed.data.imageUrl ?? null,
      },
    });
    return { success: true, data: { id: item.id } };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") return { success: false, error: "Unauthorized" };
    return { success: false, error: "Failed to create item" };
  }
}

export async function updateGrabAndGoItem(
  id: string,
  data: { name?: string; priceInCents?: number; imageUrl?: string | null }
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const item = await prisma.grabAndGoItem.findFirst({ where: { id, cafeId: session.user.cafeId } });
    if (!item) return { success: false, error: "Item not found" };

    await prisma.grabAndGoItem.update({ where: { id }, data });
    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") return { success: false, error: "Unauthorized" };
    return { success: false, error: "Failed to update item" };
  }
}

export async function updateGrabAndGoStock(
  id: string,
  stockCount: number
): Promise<ActionResult<void>> {
  try {
    await requireAuth();
    await prisma.grabAndGoItem.update({ where: { id }, data: { stockCount: Math.max(0, stockCount) } });
    return { success: true, data: undefined };
  } catch {
    return { success: false, error: "Failed to update stock" };
  }
}

export async function deleteGrabAndGoItem(id: string): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const item = await prisma.grabAndGoItem.findFirst({ where: { id, cafeId: session.user.cafeId } });
    if (!item) return { success: false, error: "Item not found" };

    await prisma.grabAndGoItem.delete({ where: { id } });
    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") return { success: false, error: "Unauthorized" };
    return { success: false, error: "Failed to delete item" };
  }
}
