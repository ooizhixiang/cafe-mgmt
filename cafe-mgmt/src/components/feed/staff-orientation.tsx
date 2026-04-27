"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { dismissOrientation } from "@/actions/onboarding.actions";

export function StaffOrientation({ cafeName }: { cafeName: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleDismiss() {
    startTransition(async () => {
      await dismissOrientation();
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50">
      <div className="bg-[var(--bg-primary)] rounded-lg p-[var(--space-6)] mx-[var(--space-4)] max-w-sm w-full shadow-xl text-center">
        <h2 className="text-headline mb-[var(--space-4)]">
          Welcome to {cafeName}!
        </h2>
        <p className="text-body text-[var(--text-secondary)] mb-[var(--space-4)]">
          This app helps you track daily tasks, log wastage, and manage comp
          events.
        </p>
        <p className="text-body text-[var(--text-secondary)] mb-[var(--space-6)]">
          You can access the <strong>Action Feed</strong> and{" "}
          <strong>Wastage/Complimentary</strong> screens from the bottom navigation.
        </p>
        <button
          onClick={handleDismiss}
          disabled={isPending}
          className="w-full touch-target rounded-lg bg-[var(--color-info)] text-white text-body font-medium py-3 disabled:opacity-50"
        >
          {isPending ? "..." : "Got it"}
        </button>
      </div>
    </div>
  );
}
