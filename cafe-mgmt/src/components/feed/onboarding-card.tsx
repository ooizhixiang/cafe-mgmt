"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeOnboardingStep } from "@/actions/onboarding.actions";
import { useToast } from "@/components/ui/toast";
import { Settings } from "lucide-react";
import type { OnboardingStep } from "@/lib/onboarding";

export function OnboardingCard({ step }: { step: OnboardingStep }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  function handleSetup() {
    router.push(step.linkRoute);
  }

  function handleDismiss() {
    startTransition(async () => {
      const result = await completeOnboardingStep(step.key);
      if (result.success) {
        router.refresh();
      } else {
        toast(result.error);
      }
    });
  }

  return (
    <div className="rounded-lg border-l-4 border-l-[var(--color-info)] border border-[var(--border-default)] p-[var(--space-4)] bg-[var(--bg-primary)]">
      <div className="flex items-start gap-[var(--space-3)]">
        <div className="mt-0.5 text-[var(--color-info)]">
          <Settings size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-body font-semibold">{step.title}</h3>
          <p className="text-meta text-[var(--text-secondary)] mt-[var(--space-1)]">
            {step.description}
          </p>
          <div className="flex gap-[var(--space-3)] mt-[var(--space-3)]">
            <button
              onClick={handleSetup}
              className="touch-target px-4 py-2 rounded-lg bg-[var(--color-info)] text-white text-meta font-medium"
            >
              Set up
            </button>
            <button
              onClick={handleDismiss}
              disabled={isPending}
              className="touch-target px-4 py-2 rounded-lg text-meta text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-50"
            >
              Looks good
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
