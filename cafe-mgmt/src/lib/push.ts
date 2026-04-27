import webPush from "web-push";
import { prisma } from "@/lib/db";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/**
 * Send a push notification to a specific user (all their subscriptions).
 * Cleans up expired/invalid subscriptions automatically.
 */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload)
        );
      } catch (err: unknown) {
        // 410 Gone or 404 = subscription expired, clean up
        if (
          err &&
          typeof err === "object" &&
          "statusCode" in err &&
          ((err as { statusCode: number }).statusCode === 410 ||
            (err as { statusCode: number }).statusCode === 404)
        ) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } });
        }
        throw err;
      }
    })
  );

  return results;
}

/**
 * Send a push notification to all users of a cafe.
 */
export async function sendPushToCafe(
  cafeId: string,
  payload: PushPayload,
  excludeUserId?: string
) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  const users = await prisma.user.findMany({
    where: { cafeId, isActive: true, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
    select: { id: true },
  });

  await Promise.allSettled(
    users.map((user) => sendPushToUser(user.id, payload))
  );
}

/**
 * Send push to all managers of a cafe.
 */
export async function sendPushToManagers(cafeId: string, payload: PushPayload) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  const managers = await prisma.user.findMany({
    where: { cafeId, isActive: true, role: "MANAGER" },
    select: { id: true },
  });

  await Promise.allSettled(
    managers.map((m) => sendPushToUser(m.id, payload))
  );
}
