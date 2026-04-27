import { describe, it, expect } from "vitest";
import {
  getIncompleteSteps,
  ONBOARDING_STEPS,
  type CafeOnboardingData,
} from "./onboarding";

describe("ONBOARDING_STEPS", () => {
  it("has 4 steps", () => {
    expect(ONBOARDING_STEPS).toHaveLength(4);
  });

  it("steps have unique keys", () => {
    const keys = ONBOARDING_STEPS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("steps are ordered by priority", () => {
    for (let i = 1; i < ONBOARDING_STEPS.length; i++) {
      expect(ONBOARDING_STEPS[i].priority).toBeGreaterThan(
        ONBOARDING_STEPS[i - 1].priority
      );
    }
  });
});

describe("getIncompleteSteps", () => {
  const baseData: CafeOnboardingData = {
    onboardingCompletedSteps: [],
    ingredientCount: 0,
    staffCount: 1,
    hasCustomizedChecklists: false,
  };

  it("returns all steps when nothing is completed", () => {
    const steps = getIncompleteSteps(baseData);
    expect(steps).toHaveLength(4);
    expect(steps[0].key).toBe("ingredients");
  });

  it("filters out explicitly completed steps", () => {
    const steps = getIncompleteSteps({
      ...baseData,
      onboardingCompletedSteps: ["ingredients", "budget"],
    });
    expect(steps).toHaveLength(2);
    expect(steps.map((s) => s.key)).toEqual(["checklists", "staff"]);
  });

  it("filters out staff step when multiple staff exist", () => {
    const steps = getIncompleteSteps({
      ...baseData,
      staffCount: 3,
    });
    expect(steps.find((s) => s.key === "staff")).toBeUndefined();
  });

  it("filters out checklists step when customized", () => {
    const steps = getIncompleteSteps({
      ...baseData,
      hasCustomizedChecklists: true,
    });
    expect(steps.find((s) => s.key === "checklists")).toBeUndefined();
  });

  it("returns empty when all steps completed", () => {
    const steps = getIncompleteSteps({
      ...baseData,
      onboardingCompletedSteps: ["ingredients", "checklists", "staff", "budget"],
    });
    expect(steps).toHaveLength(0);
  });

  it("returns results sorted by priority", () => {
    const steps = getIncompleteSteps(baseData);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].priority).toBeGreaterThan(steps[i - 1].priority);
    }
  });
});
