"use server";

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { cookies } from "next/headers";
import type { ActionResult } from "@/types";

export async function updateLastSeen(): Promise<ActionResult<void>> {
  try {
    const session = await requireAuth();
    await prisma.user.update({
      where: { id: session.user.id },
      data: { lastSeenAt: new Date() },
    });
    return { success: true, data: undefined };
  } catch {
    return { success: false, error: "Failed to update last seen" };
  }
}

export async function toggleDarkMode(): Promise<ActionResult<{ darkMode: boolean }>> {
  try {
    const session = await requireAuth();
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { darkMode: true },
    });
    const newValue = !user?.darkMode;
    await prisma.user.update({
      where: { id: session.user.id },
      data: { darkMode: newValue },
    });
    const cookieStore = await cookies();
    cookieStore.set("darkMode", newValue ? "1" : "0", {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
    return { success: true, data: { darkMode: newValue } };
  } catch {
    return { success: false, error: "Failed to toggle dark mode" };
  }
}

export async function getDarkMode(): Promise<ActionResult<{ darkMode: boolean }>> {
  try {
    const session = await requireAuth();
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { darkMode: true },
    });
    return { success: true, data: { darkMode: user?.darkMode ?? false } };
  } catch {
    return { success: false, error: "Failed to get preference" };
  }
}

/**
 * Syncs the darkMode DB value to a cookie so the root layout
 * can read it for SSR (no flash of wrong theme).
 */
export async function syncDarkModeCookie(): Promise<ActionResult<{ darkMode: boolean }>> {
  try {
    const session = await requireAuth();
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { darkMode: true },
    });
    const darkMode = user?.darkMode ?? false;
    const cookieStore = await cookies();
    cookieStore.set("darkMode", darkMode ? "1" : "0", {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
    return { success: true, data: { darkMode } };
  } catch {
    return { success: false, error: "Failed to sync dark mode" };
  }
}
