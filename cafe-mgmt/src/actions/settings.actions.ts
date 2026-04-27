"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { logError } from "@/lib/log-error";
import type { ActionResult } from "@/types";

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "UTC",
];

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const updateCafeSettingsSchema = z.object({
  timezone: z.string().refine((v) => TIMEZONES.includes(v), "Invalid timezone"),
});

const updateTimeBoundariesSchema = z.object({
  openingStart: z.string().regex(timePattern, "Invalid time format"),
  openingEnd: z.string().regex(timePattern, "Invalid time format"),
  midDayStart: z.string().regex(timePattern, "Invalid time format"),
  midDayEnd: z.string().regex(timePattern, "Invalid time format"),
  closingStart: z.string().regex(timePattern, "Invalid time format"),
  closingEnd: z.string().regex(timePattern, "Invalid time format"),
});

export async function getCafeSettings(): Promise<
  ActionResult<{
    timezone: string;
    openingStart: string | null;
    openingEnd: string | null;
    midDayStart: string | null;
    midDayEnd: string | null;
    closingStart: string | null;
    closingEnd: string | null;
  }>
> {
  try {
    const session = await requireRole("MANAGER");
    const cafe = await prisma.cafe.findUnique({
      where: { id: session.user.cafeId },
      select: {
        timezone: true,
        openingStart: true,
        openingEnd: true,
        midDayStart: true,
        midDayEnd: true,
        closingStart: true,
        closingEnd: true,
      },
    });

    if (!cafe) {
      return { success: false, error: "Cafe not found" };
    }

    return { success: true, data: cafe };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Something went wrong. Please try again." };
  }
}

export async function updateCafeSettings(
  formData: FormData
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");

    const parsed = updateCafeSettingsSchema.safeParse({
      timezone: formData.get("timezone") as string,
    });

    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    await prisma.cafe.update({
      where: { id: session.user.cafeId },
      data: { timezone: parsed.data.timezone },
    });

    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    const message =
      error instanceof Error ? error.message : "Failed to update settings";
    await logError({ context: "updateCafeSettings", message });
    return { success: false, error: "Something went wrong. Please try again." };
  }
}

export async function updateTimeBoundaries(
  formData: FormData
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");

    const raw = {
      openingStart: formData.get("openingStart") as string,
      openingEnd: formData.get("openingEnd") as string,
      midDayStart: formData.get("midDayStart") as string,
      midDayEnd: formData.get("midDayEnd") as string,
      closingStart: formData.get("closingStart") as string,
      closingEnd: formData.get("closingEnd") as string,
    };

    const parsed = updateTimeBoundariesSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const { openingStart, openingEnd, midDayStart, midDayEnd, closingStart, closingEnd } = parsed.data;

    // Validate logical order: start < end for each period
    if (openingStart >= openingEnd) {
      return { success: false, error: "Opening: end time must be after start time" };
    }
    if (midDayStart >= midDayEnd) {
      return { success: false, error: "Mid-Day: end time must be after start time" };
    }
    if (closingStart >= closingEnd) {
      return { success: false, error: "Closing: end time must be after start time" };
    }

    // Validate contiguous: periods must connect
    if (openingEnd !== midDayStart) {
      return {
        success: false,
        error: "Opening end time must match Mid-Day start time",
      };
    }
    if (midDayEnd !== closingStart) {
      return {
        success: false,
        error: "Mid-Day end time must match Closing start time",
      };
    }

    await prisma.cafe.update({
      where: { id: session.user.cafeId },
      data: {
        openingStart,
        openingEnd,
        midDayStart,
        midDayEnd,
        closingStart,
        closingEnd,
      },
    });

    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    const message =
      error instanceof Error ? error.message : "Failed to update time boundaries";
    await logError({ context: "updateTimeBoundaries", message });
    return { success: false, error: "Something went wrong. Please try again." };
  }
}
