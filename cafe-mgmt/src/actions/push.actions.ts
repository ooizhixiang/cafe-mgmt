"use server";

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import type { ActionResult } from "@/types";
import { z } from "zod/v4";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});

export async function subscribePush(
  input: z.input<typeof subscribeSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireAuth();
    const parsed = subscribeSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Invalid subscription data" };
    }

    const { endpoint, p256dh, auth } = parsed.data;

    // Upsert — same endpoint replaces old subscription
    const sub = await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        userId: session.user.id,
        endpoint,
        p256dh,
        auth,
      },
      update: {
        userId: session.user.id,
        p256dh,
        auth,
      },
    });

    return { success: true, data: { id: sub.id } };
  } catch {
    return { success: false, error: "Failed to save subscription" };
  }
}

export async function unsubscribePush(
  endpoint: string
): Promise<ActionResult<void>> {
  try {
    await requireAuth();
    await prisma.pushSubscription.deleteMany({ where: { endpoint } });
    return { success: true, data: undefined };
  } catch {
    return { success: false, error: "Failed to unsubscribe" };
  }
}

export async function getPushStatus(): Promise<ActionResult<{ subscribed: boolean }>> {
  try {
    const session = await requireAuth();
    const count = await prisma.pushSubscription.count({
      where: { userId: session.user.id },
    });
    return { success: true, data: { subscribed: count > 0 } };
  } catch {
    return { success: false, error: "Failed to check status" };
  }
}
