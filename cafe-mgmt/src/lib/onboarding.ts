export interface OnboardingStep {
  key: string;
  title: string;
  description: string;
  linkRoute: string;
  priority: number;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    key: "ingredients",
    title: "Review your ingredient list",
    description:
      "Check the pre-populated ingredients and customize them for your cafe.",
    linkRoute: "/setup/ingredients",
    priority: 1,
  },
  {
    key: "checklists",
    title: "Customize your checklists",
    description:
      "Review and adjust the daily checklists to match your routine.",
    linkRoute: "/settings",
    priority: 2,
  },
  {
    key: "staff",
    title: "Invite a staff member",
    description: "Add your team so they can use the app on their shifts.",
    linkRoute: "/settings",
    priority: 3,
  },
  {
    key: "budget",
    title: "Set your comp budget",
    description:
      "Configure a weekly comp budget to track complimentary items.",
    linkRoute: "/settings",
    priority: 4,
  },
];

export interface CafeOnboardingData {
  onboardingCompletedSteps: string[];
  ingredientCount: number;
  staffCount: number;
  hasCustomizedChecklists: boolean;
}

export function getIncompleteSteps(
  data: CafeOnboardingData
): OnboardingStep[] {
  const completed = new Set(data.onboardingCompletedSteps);

  return ONBOARDING_STEPS.filter((step) => {
    // If explicitly acknowledged, it's done
    if (completed.has(step.key)) return false;

    // Check data-based completion
    switch (step.key) {
      case "ingredients":
        // Consider done if they have ingredients (template provides them)
        // but they need to acknowledge they've reviewed them
        return !completed.has("ingredients");
      case "checklists":
        return !data.hasCustomizedChecklists && !completed.has("checklists");
      case "staff":
        return data.staffCount <= 1 && !completed.has("staff");
      case "budget":
        // Budget feature not yet implemented — always show until acknowledged
        return !completed.has("budget");
      default:
        return false;
    }
  }).sort((a, b) => a.priority - b.priority);
}
