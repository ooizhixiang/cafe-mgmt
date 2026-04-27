import { prisma } from "@/lib/db";

export async function logError({
  context,
  message,
  stack,
  userId,
  cafeId,
}: {
  context: string;
  message: string;
  stack?: string;
  userId?: string;
  cafeId?: string;
}): Promise<void> {
  try {
    await prisma.errorLog.create({
      data: { context, message, stack, userId, cafeId },
    });
  } catch {
    // Last resort: log to console if DB write fails
    console.error("[ErrorLog DB write failed]", { context, message, stack });
  }
}
