"use server";

import { prisma } from "@/lib/db";
import { requireRole, requireAuth } from "@/lib/auth";
import { logError } from "@/lib/log-error";
import { ONBOARDING_STEPS, getIncompleteSteps } from "@/lib/onboarding";
import type { ActionResult } from "@/types";
import type { OnboardingStep } from "@/lib/onboarding";

export async function getOnboardingCards(): Promise<
  ActionResult<OnboardingStep[]>
> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;

    const cafe = await prisma.cafe.findUnique({
      where: { id: cafeId },
      select: {
        templateSelected: true,
        onboardingCompletedSteps: true,
      },
    });

    if (!cafe || !cafe.templateSelected) {
      return { success: true, data: [] };
    }

    // Get data counts for completion detection
    const [staffCount, checklistCount] = await Promise.all([
      prisma.user.count({ where: { cafeId } }),
      prisma.checklistTemplate.count({ where: { cafeId } }),
    ]);

    const steps = getIncompleteSteps({
      onboardingCompletedSteps: cafe.onboardingCompletedSteps,
      ingredientCount: 0, // not used for detection currently
      staffCount,
      hasCustomizedChecklists: checklistCount > 3,
    });

    return { success: true, data: steps };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    const message =
      error instanceof Error ? error.message : "Failed to get onboarding";
    await logError({ context: "getOnboardingCards", message });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}

export async function completeOnboardingStep(
  stepKey: string
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;

    // Validate step key
    const validStep = ONBOARDING_STEPS.find((s) => s.key === stepKey);
    if (!validStep) {
      return { success: false, error: "Invalid onboarding step" };
    }

    const cafe = await prisma.cafe.findUnique({
      where: { id: cafeId },
      select: { onboardingCompletedSteps: true },
    });

    if (!cafe) {
      return { success: false, error: "Cafe not found" };
    }

    // Don't add duplicate
    if (cafe.onboardingCompletedSteps.includes(stepKey)) {
      return { success: true, data: undefined };
    }

    await prisma.cafe.update({
      where: { id: cafeId },
      data: {
        onboardingCompletedSteps: [
          ...cafe.onboardingCompletedSteps,
          stepKey,
        ],
      },
    });

    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    const message =
      error instanceof Error
        ? error.message
        : "Failed to complete onboarding step";
    await logError({ context: "completeOnboardingStep", message });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}

export async function dismissOrientation(): Promise<ActionResult<void>> {
  try {
    const session = await requireAuth();

    await prisma.user.update({
      where: { id: session.user.id },
      data: { orientationDismissedAt: new Date() },
    });

    return { success: true, data: undefined };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to dismiss orientation";
    await logError({ context: "dismissOrientation", message });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}
